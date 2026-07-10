import asyncio

import httpx

from app.main import app


async def _request(method: str, path: str, **kwargs: object) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        return await client.request(method, path, **kwargs)


def test_panel_keys_endpoint() -> None:
    response = asyncio.run(_request("GET", "/api/panel/keys"))

    assert response.status_code == 200
    payload = response.json()
    assert payload["frame"] == "base_link"
    assert payload["units"] == "meters"
    assert [key["digit"] for key in payload["keys"]] == ["1", "2", "3", "4", "5", "6"]
