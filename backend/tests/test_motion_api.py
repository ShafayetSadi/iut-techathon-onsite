import asyncio

import httpx

from app.main import app


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


def test_motion_jog_endpoint() -> None:
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
