import asyncio

import httpx

from app.main import app
from app.pin.service import PinService
from app.schemas.common import Vector3
from app.schemas.motion import IKSolveResponse
from app.schemas.panel import PanelKey, PanelKeysResponse
from app.schemas.pin import PinSequenceRequest


async def _request(method: str, path: str, **kwargs: object) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        return await client.request(method, path, **kwargs)


def test_pin_sequence_plans_all_digits_within_touch_tolerance() -> None:
    response = asyncio.run(_request("POST", "/api/pin/sequence", json={"pin": "123456"}))

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["pin"] == "123456"
    assert payload["plannedDigits"] == ["1", "2", "3", "4", "5", "6"]
    assert payload["toleranceMeters"] == 0.005
    assert payload["approachOffsetMeters"] == 0.03
    assert len(payload["steps"]) == 6
    for index, step in enumerate(payload["steps"], start=1):
        assert step["index"] == index
        assert step["pressed"] is True
        assert step["touchErrorMeters"] <= payload["toleranceMeters"]
        assert step["approachTarget"]["z"] == step["keyPosition"]["z"] + payload["approachOffsetMeters"]
        assert step["retractTarget"] == step["approachTarget"]
        assert step["touchTarget"] == step["keyPosition"]
        assert len(step["trajectory"]) >= 3


def test_pin_sequence_repeated_digits_are_separate_steps() -> None:
    response = asyncio.run(_request("POST", "/api/pin/sequence", json={"pin": "111111"}))

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert [step["digit"] for step in payload["steps"]] == ["1", "1", "1", "1", "1", "1"]
    assert [step["index"] for step in payload["steps"]] == [1, 2, 3, 4, 5, 6]


def test_pin_sequence_rejects_invalid_pin_shapes() -> None:
    invalid_payloads = [
        {"pin": "12345"},
        {"pin": "1234567"},
        {"pin": "789000"},
        {"pin": "12a456"},
    ]

    for payload in invalid_payloads:
        response = asyncio.run(_request("POST", "/api/pin/sequence", json=payload))
        assert response.status_code == 422


def test_pin_sequence_aborts_on_first_failed_waypoint() -> None:
    class FakePanelService:
        def get_keys(self) -> PanelKeysResponse:
            return PanelKeysResponse(
                frame="base_link",
                units="meters",
                approach_axis="-z",
                keys=[
                    PanelKey(digit=str(digit), position=Vector3(x=0.5, y=0.0, z=0.05))
                    for digit in range(1, 7)
                ],
            )

    class FakeMotionPlanner:
        calls = 0

        def solve_target(
            self,
            target: Vector3,
            current_joints: dict[str, float] | None = None,
        ) -> IKSolveResponse:
            self.calls += 1
            if self.calls == 2:
                return IKSolveResponse(
                    success=False,
                    tip={"x": target.x, "y": target.y, "z": target.z},
                    errorMeters=0.5,
                    reason="forced touch failure",
                )
            return IKSolveResponse(
                success=True,
                joints={"joint_1": 0.0},
                tip={"x": target.x, "y": target.y, "z": target.z},
                errorMeters=0.0,
                trajectory=[],
            )

    response = PinService(FakePanelService(), FakeMotionPlanner()).plan_sequence(
        PinSequenceRequest(pin="111111")
    )

    assert response.success is False
    assert response.message == "forced touch failure"
    assert len(response.steps) == 1
    assert response.steps[0].digit == "1"
    assert response.steps[0].pressed is False
