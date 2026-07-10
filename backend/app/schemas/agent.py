from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import Vector3


class RelativeMoveAction(BaseModel):
    type: Literal["relative_move"]
    reference: str = Field(description="panel or key:<digit>")
    distance_m: float = Field(gt=0, le=0.30, alias="distanceM")

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class CartesianJogAction(BaseModel):
    type: Literal["jog_cartesian"]
    delta: Vector3

    model_config = ConfigDict(extra="forbid")


class MoveToAction(BaseModel):
    type: Literal["move_to"]
    target: Vector3

    model_config = ConfigDict(extra="forbid")


class PressKeyAction(BaseModel):
    type: Literal["press_key"]
    key: str = Field(pattern=r"^[1-6]$")
    repeat: int = Field(default=1, ge=1, le=6)

    model_config = ConfigDict(extra="forbid")


class JointAction(BaseModel):
    type: Literal["jog_joint", "set_joint"]
    joint: str
    radians: float

    model_config = ConfigDict(extra="forbid")


class SimpleAction(BaseModel):
    type: Literal["home", "stop"]

    model_config = ConfigDict(extra="forbid")


SemanticAction = Annotated[
    Union[
        RelativeMoveAction,
        CartesianJogAction,
        MoveToAction,
        PressKeyAction,
        JointAction,
        SimpleAction,
    ],
    Field(discriminator="type"),
]


class AgentSemanticStep(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    source_text: str = Field(alias="sourceText")
    intent: str
    analysis: str
    status: Literal["resolved", "ambiguous", "invalid"]
    action: SemanticAction | None = None
    ambiguity: str | None = None

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class AgentDraft(BaseModel):
    confirmation: str
    steps: list[AgentSemanticStep] = Field(min_length=1, max_length=12)
    clarifying_question: str | None = Field(default=None, alias="clarifyingQuestion")

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class TemplateAlternative(BaseModel):
    template: str
    confidence: float = Field(ge=0, le=1)

    model_config = ConfigDict(extra="forbid")


class AgentChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1200)
    t: int = Field(ge=0)

    model_config = ConfigDict(extra="forbid")


class AgentRequest(BaseModel):
    transcript: str = Field(min_length=1, max_length=2000)
    resolution_status: Literal["unmatched", "ambiguous", "clarification"] = Field(alias="resolutionStatus")
    alternatives: list[TemplateAlternative] | None = None
    current_joints: dict[str, float] = Field(alias="currentJoints")
    pending_plan: AgentDraft | None = Field(default=None, alias="pendingPlan")
    chat_history: list[AgentChatMessage] = Field(default_factory=list, max_length=10, alias="chatHistory")

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class JogCartesianCommand(BaseModel):
    type: Literal["jog_cartesian"] = "jog_cartesian"
    delta: Vector3
    frame: Literal["world"] = "world"

    model_config = ConfigDict(extra="forbid")


class MoveToCommand(BaseModel):
    type: Literal["move_to"] = "move_to"
    target: Vector3

    model_config = ConfigDict(extra="forbid")


class JointCommand(BaseModel):
    type: Literal["jog_joint", "set_joint"]
    joint: int
    delta: float | None = None
    value: float | None = None

    model_config = ConfigDict(extra="forbid")


class SimpleCommand(BaseModel):
    type: Literal["home", "stop"]

    model_config = ConfigDict(extra="forbid")


PhysicalCommand = Annotated[
    Union[JogCartesianCommand, MoveToCommand, JointCommand, SimpleCommand],
    Field(discriminator="type"),
]


class SequenceCommand(BaseModel):
    type: Literal["sequence"] = "sequence"
    steps: list[PhysicalCommand] = Field(min_length=1, max_length=24)

    model_config = ConfigDict(extra="forbid")


class AgentPlanStep(BaseModel):
    id: str
    source_text: str = Field(alias="sourceText")
    intent: str
    analysis: str
    status: Literal["resolved", "ambiguous", "invalid", "validated"]
    command: PhysicalCommand | None = None

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class AgentResponse(BaseModel):
    status: Literal["ready", "needs_clarification", "rejected"]
    confirmation: str
    steps: list[AgentPlanStep] = Field(default_factory=list)
    command: SequenceCommand | None = None
    clarifying_question: str | None = Field(default=None, alias="clarifyingQuestion")
    failure_reason: str | None = Field(default=None, alias="failureReason")
    planned_from_joints: dict[str, float] | None = Field(default=None, alias="plannedFromJoints")
    pending_plan: AgentDraft | None = Field(default=None, alias="pendingPlan")

    model_config = ConfigDict(populate_by_name=True, extra="forbid")
