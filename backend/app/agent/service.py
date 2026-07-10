from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

import httpx
from pydantic import ValidationError as PydanticValidationError

from app.agent.compiler import AgentCompiler
from app.core.config import Settings
from app.core.errors import RobotBackendError
from app.panel.service import PanelService
from app.robot.kinematics import forward_kinematics
from app.robot.urdf_loader import RobotModel
from app.schemas.agent import AgentDraft, AgentPlanStep, AgentRequest, AgentResponse


PROMPT_DIR = Path(__file__).with_name("prompts")


class AgentService:
    def __init__(
        self,
        settings: Settings,
        model: RobotModel,
        panel: PanelService,
        compiler: AgentCompiler,
    ) -> None:
        self.settings = settings
        self.model = model
        self.panel = panel
        self.compiler = compiler
        self.system_prompt = "\n\n".join(
            (PROMPT_DIR / name).read_text().strip()
            for name in ("system.md", "compound.md", "clarify.md")
        )

    async def interpret(self, request: AgentRequest) -> AgentResponse:
        if not self.settings.openrouter_api_key or not self.settings.openrouter_model:
            return self._rejected(
                "Agentic control is not configured: set ROBOT_OPENROUTER_API_KEY and ROBOT_OPENROUTER_MODEL."
            )

        try:
            draft = await self._request_draft(request)
        except (
            httpx.HTTPError,
            PydanticValidationError,
            RobotBackendError,
            ValueError,
            KeyError,
            IndexError,
            TypeError,
        ) as exc:
            return self._rejected(f"OpenRouter could not produce a valid plan: {exc}")

        unresolved = [step for step in draft.steps if step.status != "resolved" or step.action is None]
        if unresolved:
            question = (
                draft.clarifying_question
                or unresolved[0].ambiguity
                or "Could you clarify the unresolved step?"
            )
            return AgentResponse(
                status="needs_clarification",
                confirmation=draft.confirmation,
                steps=[
                    AgentPlanStep(
                        id=step.id,
                        sourceText=step.source_text,
                        intent=step.intent,
                        analysis=step.analysis,
                        status=step.status,
                    )
                    for step in draft.steps
                ],
                clarifyingQuestion=question,
                pendingPlan=draft,
                plannedFromJoints=request.current_joints,
            )

        try:
            steps, command = self.compiler.compile(draft, request.current_joints)
        except RobotBackendError as exc:
            return self._rejected(str(exc), draft=draft, joints=request.current_joints)

        return AgentResponse(
            status="ready",
            confirmation=draft.confirmation,
            steps=steps,
            command=command,
            plannedFromJoints=request.current_joints,
        )

    async def _request_draft(self, request: AgentRequest) -> AgentDraft:
        context = {
            "transcript": request.transcript,
            "resolutionStatus": request.resolution_status,
            "deterministicAlternatives": [item.model_dump() for item in request.alternatives or []],
            "currentJoints": request.current_joints,
            "pendingPlan": request.pending_plan.model_dump(by_alias=True) if request.pending_plan else None,
            "chatHistory": [item.model_dump() for item in request.chat_history],
        }
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": json.dumps(context)},
        ]
        tools = self._tool_definitions()

        for _ in range(self.settings.openrouter_max_tool_iterations + 1):
            payload = {
                "model": self.settings.openrouter_model,
                "messages": messages,
                "tools": tools,
                "tool_choice": "auto",
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "agent_draft",
                        "strict": True,
                        "schema": self._strict_schema(AgentDraft.model_json_schema(by_alias=True)),
                    },
                },
                "provider": {"require_parameters": True},
                "stream": False,
            }
            response = await self._post(payload)
            body = response.json()
            message = body["choices"][0]["message"]
            tool_calls = message.get("tool_calls") or []
            if not tool_calls:
                content = message.get("content")
                if not isinstance(content, str):
                    raise ValueError("OpenRouter returned no structured plan")
                return AgentDraft.model_validate_json(content)

            messages.append({
                "role": "assistant",
                "content": message.get("content"),
                "tool_calls": tool_calls,
            })
            for call in tool_calls:
                function = call.get("function") or {}
                name = function.get("name")
                result = self._run_tool(name, request.current_joints)
                messages.append({
                    "role": "tool",
                    "tool_call_id": call["id"],
                    "name": name,
                    "content": json.dumps(result),
                })

        raise ValueError("OpenRouter exceeded the tool-call iteration limit")

    async def _post(self, payload: dict[str, Any]) -> httpx.Response:
        headers = {
            "Authorization": f"Bearer {self.settings.openrouter_api_key}",
            "Content-Type": "application/json",
            "X-Title": self.settings.openrouter_app_title,
        }
        if self.settings.openrouter_http_referer:
            headers["HTTP-Referer"] = self.settings.openrouter_http_referer

        async with httpx.AsyncClient(timeout=self.settings.openrouter_timeout_s) as client:
            for attempt in range(2):
                response = await client.post(self.settings.openrouter_url, headers=headers, json=payload)
                if response.status_code not in (429, 503) or attempt == 1:
                    if response.is_error:
                        detail = self._provider_error(response)
                        raise httpx.HTTPStatusError(detail, request=response.request, response=response)
                    return response
                retry_after = response.headers.get("Retry-After", "0")
                try:
                    delay = min(max(float(retry_after), 0.0), 2.0)
                except ValueError:
                    delay = 0.0
                if delay:
                    await asyncio.sleep(delay)
        raise ValueError("OpenRouter request did not return a response")

    def _run_tool(self, name: str | None, current_joints: dict[str, float]) -> dict[str, Any]:
        if name == "get_robot_context":
            tip = forward_kinematics(self.model, current_joints).tip
            return {
                "joints": current_joints,
                "tip": {"x": float(tip[0]), "y": float(tip[1]), "z": float(tip[2])},
                "controlledJoints": list(self.model.controlled_joint_names),
            }
        if name == "get_panel_geometry":
            return self.panel.get_keys().model_dump(by_alias=True)
        raise ValueError(f"OpenRouter requested unknown tool {name!r}")

    @staticmethod
    def _tool_definitions() -> list[dict[str, Any]]:
        empty_schema = {"type": "object", "properties": {}, "additionalProperties": False}
        return [
            {
                "type": "function",
                "function": {
                    "name": "get_robot_context",
                    "description": "Read current joints, tip position, and valid controlled joint names.",
                    "parameters": empty_schema,
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "get_panel_geometry",
                    "description": "Read panel key coordinates, frame, units, and approach axis.",
                    "parameters": empty_schema,
                },
            },
        ]

    @classmethod
    def _strict_schema(cls, value: Any) -> Any:
        """Make Pydantic JSON Schema portable across strict-output providers."""
        if isinstance(value, list):
            return [cls._strict_schema(item) for item in value]
        if not isinstance(value, dict):
            return value

        result = {
            key: cls._strict_schema(item)
            for key, item in value.items()
            if key != "default"
        }
        properties = result.get("properties")
        if result.get("type") == "object" and isinstance(properties, dict):
            result["required"] = list(properties)
            result.setdefault("additionalProperties", False)
        return result

    @staticmethod
    def _provider_error(response: httpx.Response) -> str:
        try:
            body = response.json()
            error = body.get("error", body)
            detail = error.get("message", error) if isinstance(error, dict) else error
        except ValueError:
            detail = response.text
        return f"OpenRouter returned {response.status_code}: {detail}"

    @staticmethod
    def _rejected(
        reason: str,
        *,
        draft: AgentDraft | None = None,
        joints: dict[str, float] | None = None,
    ) -> AgentResponse:
        steps = []
        if draft:
            steps = [
                AgentPlanStep(
                    id=step.id,
                    sourceText=step.source_text,
                    intent=step.intent,
                    analysis=step.analysis,
                    status="invalid" if step.status == "resolved" else step.status,
                )
                for step in draft.steps
            ]
        return AgentResponse(
            status="rejected",
            confirmation=draft.confirmation if draft else "I could not safely interpret that instruction.",
            steps=steps,
            failureReason=reason,
            plannedFromJoints=joints,
        )
