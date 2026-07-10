import asyncio
import json
import math
from unittest.mock import AsyncMock

import httpx
import pytest

from app.agent.service import AgentService
from app.dependencies import get_agent_compiler, get_panel_service, get_robot_model
from app.schemas.agent import AgentDraft, AgentRequest


EXAMPLE = "nudge the tip a couple centimeters toward the panel and tap the 5 key twice"


def _example_draft() -> AgentDraft:
    return AgentDraft.model_validate(
        {
            "confirmation": "I understood that you want me to move 2 centimeters toward the panel and tap key 5 twice.",
            "steps": [
                {
                    "id": "move-panel",
                    "sourceText": "nudge the tip a couple centimeters toward the panel",
                    "intent": "Move 2 cm toward the panel",
                    "analysis": "A couple centimeters resolves to 20 mm.",
                    "status": "resolved",
                    "action": {"type": "relative_move", "reference": "panel", "distanceM": 0.02},
                },
                {
                    "id": "tap-5",
                    "sourceText": "tap the 5 key twice",
                    "intent": "Tap key 5 twice",
                    "analysis": "Twice resolves to two complete touches.",
                    "status": "resolved",
                    "action": {"type": "press_key", "key": "5", "repeat": 2},
                },
            ],
        }
    )


def _request(**overrides) -> AgentRequest:
    payload = {
        "transcript": EXAMPLE,
        "resolutionStatus": "unmatched",
        "currentJoints": get_robot_model().neutral_pose(),
    }
    payload.update(overrides)
    return AgentRequest.model_validate(payload)


def _service() -> AgentService:
    settings = type("Settings", (), {
        "openrouter_api_key": "test-key",
        "openrouter_model": "test/model",
        "openrouter_url": "https://openrouter.ai/api/v1/chat/completions",
        "openrouter_timeout_s": 1.0,
        "openrouter_max_tool_iterations": 2,
        "openrouter_http_referer": None,
        "openrouter_app_title": "test",
    })()
    return AgentService(settings, get_robot_model(), get_panel_service(), get_agent_compiler())


def _response(message: dict) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": message}]})


def test_compiler_expands_rubric_example_into_six_preflighted_steps() -> None:
    steps, command = get_agent_compiler().compile(_example_draft(), get_robot_model().neutral_pose())

    assert len(steps) == 6
    assert len(command.steps) == 6
    assert [step.intent for step in steps] == [
        "Move 2 cm toward panel",
        "Approach key 5",
        "Touch key 5 (1/2)",
        "Retract from key 5 (1/2)",
        "Touch key 5 (2/2)",
        "Retract from key 5 (2/2)",
    ]
    jog = command.steps[0]
    assert jog.type == "jog_cartesian"
    assert math.sqrt(jog.delta.x**2 + jog.delta.y**2 + jog.delta.z**2) == pytest.approx(0.02)
    assert command.steps[1].target.model_dump() == {"x": 0.55, "y": -0.05, "z": 0.08}
    assert command.steps[2].target.model_dump() == {"x": 0.55, "y": -0.05, "z": 0.05}


def test_service_uses_tools_then_returns_compiled_plan() -> None:
    service = _service()
    service._post = AsyncMock(
        side_effect=[
            _response(
                {
                    "content": None,
                    "tool_calls": [
                        {"id": "call-1", "function": {"name": "get_panel_geometry", "arguments": "{}"}}
                    ],
                }
            ),
            _response({"content": _example_draft().model_dump_json(by_alias=True)}),
        ]
    )

    result = asyncio.run(service.interpret(_request(chatHistory=[
        {"role": "user", "content": "previously asked about key 5", "t": 1},
        {"role": "assistant", "content": "I understood that you want me to tap key 5.", "t": 2},
    ])))

    assert result.status == "ready"
    assert result.command is not None
    assert len(result.command.steps) == 6
    second_payload = service._post.call_args_list[1].args[0]
    assert second_payload["response_format"]["type"] == "json_schema"
    schema = second_payload["response_format"]["json_schema"]["schema"]
    assert "clarifyingQuestion" in schema["required"]
    assert "default" not in str(schema)
    assert second_payload["provider"] == {"require_parameters": True}
    assert second_payload["messages"][-1]["role"] == "tool"
    context = json.loads(second_payload["messages"][1]["content"])
    assert context["chatHistory"][0]["content"] == "previously asked about key 5"


def test_ambiguous_draft_returns_pending_plan_without_command() -> None:
    service = _service()
    draft = AgentDraft.model_validate(
        {
            "confirmation": "I understood that you want me to move, but the direction is unclear.",
            "clarifyingQuestion": "Which direction should I move?",
            "steps": [
                {
                    "id": "move",
                    "sourceText": "move it",
                    "intent": "Move the tip",
                    "analysis": "The direction is missing.",
                    "status": "ambiguous",
                    "ambiguity": "A direction is required.",
                }
            ],
        }
    )
    service._post = AsyncMock(return_value=_response({"content": draft.model_dump_json(by_alias=True)}))

    result = asyncio.run(service.interpret(_request(transcript="move it", resolutionStatus="ambiguous")))

    assert result.status == "needs_clarification"
    assert result.command is None
    assert result.pending_plan == draft
    assert result.clarifying_question == "Which direction should I move?"


def test_service_rejects_unconfigured_openrouter() -> None:
    service = _service()
    service.settings.openrouter_api_key = None

    result = asyncio.run(service.interpret(_request()))

    assert result.status == "rejected"
    assert "ROBOT_OPENROUTER_API_KEY" in result.failure_reason
