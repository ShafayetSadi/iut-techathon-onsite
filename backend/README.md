# backend

Server-side services for the Dry Run arm suite. **Owned separately from the
frontend** — the frontend team does not need to touch this.

Phase 1 needs no backend: the entire motion pipeline lives in the frontend
Zustand store. This folder exists so later phases have a clean home:

| Route | Phase | Purpose |
|-------|-------|---------|
| `GET /health` | now | liveness for docker-compose |
| `POST /api/ik` | Phase 2 | inverse kinematics: `{ target: {x,y,z} }` → joint angles |
| `POST /api/agent` | Phase 3B | agentic NL → structured `MotionCommand[]` (must pass the frontend's deterministic safety gate before execution) |

Currently zero runtime dependencies (Node built-in `http`).

```bash
npm start        # node src/server.js  → :4000
curl localhost:4000/health
```
