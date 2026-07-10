import asyncio

import httpx

from app.dependencies import get_motion_planner
from app.main import app
from app.schemas.common import Vector3


async def _request(method: str, path: str, **kwargs: object) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        return await client.request(method, path, **kwargs)


def test_health_endpoint() -> None:
    response = asyncio.run(_request("GET", "/health"))

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_ik_solve_endpoint_for_panel_key() -> None:
    response = asyncio.run(
        _request("POST", "/api/ik/solve", json={"target": {"x": 0.55, "y": -0.05, "z": 0.05}})
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["errorMeters"] <= 0.005
    assert len(payload["trajectory"]) >= 2


def test_motion_jog_endpoint_accepts_vector_delta() -> None:
    model = asyncio.run(_request("GET", "/api/robot/model")).json()
    response = asyncio.run(
        _request(
            "POST",
            "/api/motion/jog",
            json={"currentJoints": model["neutral_pose"], "delta": {"x": 0.02, "y": 0.0, "z": -0.02}},
        )
    )

    assert response.status_code == 200
    assert "success" in response.json()


def test_motion_jog_endpoint_accepts_diagonal_delta_in_one_request() -> None:
    model = asyncio.run(_request("GET", "/api/robot/model")).json()
    response = asyncio.run(
        _request(
            "POST",
            "/api/motion/jog",
            json={"currentJoints": model["neutral_pose"], "delta": {"x": 0.015, "y": 0.015, "z": 0.0}},
        )
    )

    assert response.status_code == 200
    payload = response.json()
    assert "success" in payload
    assert payload["command"] == "jog"


def test_motion_jog_endpoint_rejects_missing_delta_coordinate() -> None:
    model = asyncio.run(_request("GET", "/api/robot/model")).json()
    response = asyncio.run(
        _request(
            "POST",
            "/api/motion/jog",
            json={"currentJoints": model["neutral_pose"], "delta": {"x": 0.01, "y": 0.0}},
        )
    )

    assert response.status_code == 422


def test_motion_jog_endpoint_rejects_extra_delta_coordinate() -> None:
    model = asyncio.run(_request("GET", "/api/robot/model")).json()
    response = asyncio.run(
        _request(
            "POST",
            "/api/motion/jog",
            json={
                "currentJoints": model["neutral_pose"],
                "delta": {"x": 0.01, "y": 0.0, "z": 0.0, "axis": "x"},
            },
        )
    )

    assert response.status_code == 422


def test_motion_planner_jog_uses_full_vector_delta() -> None:
    planner = get_motion_planner()
    current = planner.model.neutral_pose()
    current_tip = planner.solve_target(
        Vector3(x=0.55, y=-0.05, z=0.05),
        current,
    )
    assert current_tip.success
    assert current_tip.joints is not None
    assert current_tip.tip is not None

    delta = Vector3(x=0.01, y=0.01, z=-0.005)
    response = planner.jog(current_tip.joints, delta)

    assert response.success, response.reason
    assert response.tip is not None
    assert abs(response.tip["x"] - (current_tip.tip["x"] + delta.x)) <= 0.005
    assert abs(response.tip["y"] - (current_tip.tip["y"] + delta.y)) <= 0.005
    assert abs(response.tip["z"] - (current_tip.tip["z"] + delta.z)) <= 0.005


def test_motion_planner_jog_moves_for_continuous_tick_sized_delta() -> None:
    planner = get_motion_planner()
    current = planner.model.neutral_pose()
    before = planner.solve_target(Vector3(x=0.0, y=0.0, z=1.497), current)
    assert before.success
    assert before.joints is not None
    assert before.tip is not None

    delta = Vector3(x=0.0048, y=0.0, z=0.0)
    response = planner.jog(before.joints, delta)

    assert response.success, response.reason
    assert response.tip is not None
    assert response.error_meters is not None
    assert response.error_meters <= 0.001
    assert response.tip["x"] > before.tip["x"] + 0.003


def test_robot_urdf_endpoint_serves_source_model() -> None:
    response = asyncio.run(_request("GET", "/api/robot/urdf"))

    assert response.status_code == 200
    assert "<robot name=\"stylus_arm\">" in response.text
    assert "stylus_tip" in response.text
