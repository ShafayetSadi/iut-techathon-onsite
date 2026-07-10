import asyncio

import httpx
import pytest

from app.dependencies import get_voice_service
from app.main import app


async def _request(method: str, path: str, **kwargs: object) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        return await client.request(method, path, **kwargs)


@pytest.fixture
def service():
    get_voice_service.cache_clear()
    yield get_voice_service()
    get_voice_service.cache_clear()


def _stub_elevenlabs(monkeypatch, *, status_code: int = 200, payload: dict | None = None) -> dict:
    """Replace the outbound POST so no test ever touches the network."""
    captured: dict = {}

    async def fake_post(self, url, **kwargs):  # noqa: ANN001
        captured["url"] = url
        captured["headers"] = kwargs.get("headers")
        captured["data"] = kwargs.get("data")
        captured["files"] = kwargs.get("files")
        return httpx.Response(
            status_code,
            json=payload if payload is not None else {"text": "move up", "language_code": "eng"},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    return captured


def test_transcribe_returns_text(monkeypatch, service) -> None:
    monkeypatch.setattr(service.settings, "elevenlabs_api_key", "test-key")
    captured = _stub_elevenlabs(monkeypatch)

    response = asyncio.run(
        _request("POST", "/api/voice/transcribe", files={"audio": ("clip.webm", b"fake-audio", "audio/webm")})
    )

    assert response.status_code == 200
    assert response.json() == {"transcript": "move up", "languageCode": "eng"}
    assert captured["headers"]["xi-api-key"] == "test-key"
    assert captured["data"]["model_id"] == "scribe_v1"
    assert captured["files"]["file"][0] == "clip.webm"


def test_transcribe_requires_api_key(monkeypatch, service) -> None:
    monkeypatch.setattr(service.settings, "elevenlabs_api_key", None)

    response = asyncio.run(
        _request("POST", "/api/voice/transcribe", files={"audio": ("clip.webm", b"fake-audio", "audio/webm")})
    )

    assert response.status_code == 400
    assert "ROBOT_ELEVENLABS_API_KEY" in response.json()["reason"]


def test_transcribe_rejects_empty_audio(monkeypatch, service) -> None:
    monkeypatch.setattr(service.settings, "elevenlabs_api_key", "test-key")

    response = asyncio.run(
        _request("POST", "/api/voice/transcribe", files={"audio": ("clip.webm", b"", "audio/webm")})
    )

    assert response.status_code == 400
    assert "empty" in response.json()["reason"].lower()


def test_transcribe_surfaces_provider_failure(monkeypatch, service) -> None:
    monkeypatch.setattr(service.settings, "elevenlabs_api_key", "test-key")
    _stub_elevenlabs(monkeypatch, status_code=401, payload={"detail": "bad key"})

    response = asyncio.run(
        _request("POST", "/api/voice/transcribe", files={"audio": ("clip.webm", b"fake-audio", "audio/webm")})
    )

    assert response.status_code == 400
    assert "401" in response.json()["reason"]
