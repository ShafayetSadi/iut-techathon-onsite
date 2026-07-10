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


def _post_clip() -> httpx.Response:
    return asyncio.run(
        _request("POST", "/api/voice/transcribe", files={"audio": ("clip.webm", b"fake-audio", "audio/webm")})
    )


def _ok(text: str = "move up") -> tuple[int, dict]:
    return 200, {"text": text, "language_code": "eng"}


def _stub_elevenlabs(monkeypatch, *responses: tuple[int, dict]) -> list[dict]:
    """Replace the outbound POST so no test ever touches the network.

    Returns the list of captured calls. Each entry is one request; the fallback
    tests assert on how many were made and what the second one dropped. The last
    response repeats if the service posts more times than were supplied.
    """
    calls: list[dict] = []
    queue = list(responses) or [_ok()]

    async def fake_post(self, url, **kwargs):  # noqa: ANN001
        calls.append({"url": url, "headers": kwargs.get("headers"), "data": kwargs.get("data"), "files": kwargs.get("files")})
        status_code, payload = queue[min(len(calls) - 1, len(queue) - 1)]
        return httpx.Response(status_code, json=payload, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    return calls


def test_transcribe_returns_text(monkeypatch, service) -> None:
    monkeypatch.setattr(service.settings, "elevenlabs_api_key", "test-key")
    calls = _stub_elevenlabs(monkeypatch)

    response = _post_clip()

    assert response.status_code == 200
    assert response.json() == {"transcript": "move up", "languageCode": "eng"}
    assert calls[0]["headers"]["xi-api-key"] == "test-key"
    assert calls[0]["data"]["model_id"] == "scribe_v2"
    assert calls[0]["files"]["file"][0] == "clip.webm"


def test_transcribe_pins_language_and_silences_audio_events(monkeypatch, service) -> None:
    """Auto-detect transcribed an English "hello" as Hindi; audio-event tags like
    "(dishes clanking)" reached the matcher as if they were speech."""
    monkeypatch.setattr(service.settings, "elevenlabs_api_key", "test-key")
    calls = _stub_elevenlabs(monkeypatch)

    _post_clip()

    assert calls[0]["data"]["language_code"] == "eng"
    assert calls[0]["data"]["tag_audio_events"] == "false"


def test_transcribe_sends_keyterms(monkeypatch, service) -> None:
    monkeypatch.setattr(service.settings, "elevenlabs_api_key", "test-key")
    calls = _stub_elevenlabs(monkeypatch)

    _post_clip()

    # httpx renders a list value as one repeated multipart part per item.
    assert "forearm" in calls[0]["data"]["keyterms"]


def test_transcribe_omits_keyterms_when_disabled(monkeypatch, service) -> None:
    monkeypatch.setattr(service.settings, "elevenlabs_api_key", "test-key")
    monkeypatch.setattr(service.settings, "elevenlabs_keyterms_enabled", False)
    calls = _stub_elevenlabs(monkeypatch)

    _post_clip()

    assert len(calls) == 1
    assert "keyterms" not in calls[0]["data"]


def test_transcribe_skips_keyterms_on_scribe_v1(monkeypatch, service) -> None:
    """Verified against the live API: scribe_v1 rejects keyterms outright. Sending
    it anyway would cost a rejected round trip on every utterance, not just one."""
    monkeypatch.setattr(service.settings, "elevenlabs_api_key", "test-key")
    monkeypatch.setattr(service.settings, "elevenlabs_stt_model", "scribe_v1")
    calls = _stub_elevenlabs(monkeypatch)

    response = _post_clip()

    assert response.status_code == 200
    assert len(calls) == 1
    assert "keyterms" not in calls[0]["data"]


def test_transcribe_retries_once_without_keyterms(monkeypatch, service) -> None:
    """A model that starts refusing keyterms must not fail the utterance."""
    monkeypatch.setattr(service.settings, "elevenlabs_api_key", "test-key")
    calls = _stub_elevenlabs(
        monkeypatch,
        (400, {"detail": {"message": "Invalid parameter: keyterms is not supported."}}),
        _ok(),
    )

    response = _post_clip()

    assert response.status_code == 200
    assert response.json()["transcript"] == "move up"
    assert len(calls) == 2
    assert "keyterms" in calls[0]["data"]
    assert "keyterms" not in calls[1]["data"]


def test_transcribe_does_not_retry_unrelated_failures(monkeypatch, service) -> None:
    """An unplayable clip fails the same way twice. Retrying it would double every
    bad request and hide the real reason."""
    monkeypatch.setattr(service.settings, "elevenlabs_api_key", "test-key")
    calls = _stub_elevenlabs(monkeypatch, (400, {"detail": {"message": "File is corrupted."}}))

    response = _post_clip()

    assert response.status_code == 400
    assert len(calls) == 1
    assert "File is corrupted." in response.json()["reason"]


def test_transcribe_requires_api_key(monkeypatch, service) -> None:
    monkeypatch.setattr(service.settings, "elevenlabs_api_key", None)

    response = _post_clip()

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
    _stub_elevenlabs(monkeypatch, (401, {"detail": "bad key"}))

    response = _post_clip()

    assert response.status_code == 400
    assert "401" in response.json()["reason"]
    assert "bad key" in response.json()["reason"]


def test_transcribe_explains_short_audio(monkeypatch, service) -> None:
    """The raw envelope put a wall of JSON in the operator's transcript log."""
    monkeypatch.setattr(service.settings, "elevenlabs_api_key", "test-key")
    _stub_elevenlabs(
        monkeypatch,
        (400, {"detail": {"status": "audio_too_short", "message": "Audio is too short."}}),
    )

    response = _post_clip()

    assert response.status_code == 400
    reason = response.json()["reason"]
    assert "hold the button" in reason.lower()
    assert "detail" not in reason
