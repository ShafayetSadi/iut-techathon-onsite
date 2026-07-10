# Robotic Arm Backend

FastAPI backend for the final-round robotic arm challenge. It exposes one shared motion pipeline for IK, joystick/keyboard jogs, voice commands, autonomous PIN entry, and hardware metadata.

## Run

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

API docs are available at `http://localhost:8000/docs`.

## Run With Docker Compose

```bash
cd ..
docker compose up --build
```

The backend will be available at `http://localhost:8000`.

## Key Endpoints

- `GET /health` - service status.
- `GET /api/robot/model` - joint names, limits, TCP frame, and neutral pose.
- `POST /api/ik/solve` - solve joint angles for a target stylus-tip `{x, y, z}`.
- `POST /api/motion/jog` - jog the current stylus tip by `{dx, dy, dz}`.
- `GET /api/panel/keys` - fixed test-panel key coordinates from `key.config.json`.
- `POST /api/pin/sequence` - Phase 4 sequencing scaffold.
- `POST /api/voice/command` - Phase 3 deterministic voice-command scaffold.
- `GET /api/hardware/schematic` - Phase 5 schematic checklist scaffold.
- `WS /ws/state` - live state/event stream for the frontend.

## IK Smoke Test

```bash
cd backend
uv run python scripts/smoke_ik.py
```

This solves IK for all six panel keys and prints the final stylus-tip error.
