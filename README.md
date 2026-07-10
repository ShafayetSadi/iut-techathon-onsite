# Dry Run — 6-DOF Stylus-Arm Simulator

Browser-based simulation & control suite for Vantage Robotics' 6-DOF industrial
arm (IUT Techathon Nationals, final round). No real hardware — everything runs
in-browser from the provided URDF.

> **Core principle: one motion pipeline, five triggers.** The dashboard,
> joystick, keyboard, voice, and autonomous PIN entry are all *triggers into* a
> single authoritative motion store. Nothing owns its own copy of arm state.

## What's here (Phase 1 — See the Arm ✅)

- **Interactive URDF viewer** — a Three.js host reproducing the
  [gkjohnson/urdf-loaders](https://github.com/gkjohnson/urdf-loaders) viewer,
  tailored to this arm: orbit/zoom, **drag any joint to rotate it**, hover
  highlight, collision-geometry toggle, ignore-limits, auto-rotate.
- **Live dashboard** — joint angles (deg/rad), end-effector XYZ, mode/status
  pills, and a scrolling event log, all updating every frame from the store.
- **6-key test panel** — rendered at the exact `key.config.json` coordinates,
  with digit labels and a magenta **test marker** at key "1" for the
  coordinate-frame sanity check (§7 of the brief).

## Repository layout

```
.
├── frontend/            # Next.js 14 + React + TS — the whole UI (frontend team)
│   ├── src/
│   │   ├── app/                  # Next app router (layout, page, globals.css)
│   │   ├── components/
│   │   │   ├── scene/RobotScene.tsx   # the Three.js host — "the tool"
│   │   │   ├── dashboard/             # JointReadout, EEReadout, ModeStatus, EventLog
│   │   │   └── viewer/                # JointSliders, ViewerControls
│   │   ├── lib/
│   │   │   ├── motion/       # commands.ts, store.ts (Zustand), validate.ts
│   │   │   ├── robot/        # urdfLoad.ts, robotAdapter.ts (FK)
│   │   │   ├── panel/        # keyConfig.ts (6-key panel loader)
│   │   │   └── viewer/       # viewerStore.ts (display prefs)
│   │   └── config/robot.config.ts     # joints, limits, EE link, tolerances
│   └── public/{urdf,config}/          # served copies of the provided assets
├── backend/             # IK service + agentic/voice layer for later phases
├── 6_dof_arm.urdf       # provided by organizers (source of truth)
├── key.config.json      # provided by organizers (source of truth)
└── docker-compose.yml
```

## Run it

### Local dev
```bash
cd frontend
npm install
npm run dev            # http://localhost:3000
```

### Docker (frontend + backend)
```bash
docker compose up --build
# frontend → http://localhost:3000
# backend  → http://localhost:4000/health
```

## Architecture — single source of truth

```
             dispatch(command)            validate()
UI triggers ───────────────► Motion Store ───────► Robot Adapter ──► URDF robot
(dashboard, joystick,          (Zustand:            (applies joints,
 keyboard, voice, PIN)          jointAngles,         computes FK)
                                eePosition, …)
      Dashboard ◄──── subscribes ──┘
```

- `jointAngles` in the store is the **only** authoritative arm state; the URDF
  robot is a *renderer* of it. The render loop reads the store each frame, pushes
  angles onto the robot, computes the stylus-tip pose via FK, and writes
  `eePosition` back.
- Every command funnels through `dispatch()` → `validateCommand()` (the
  deterministic safety gate: joint limits + workspace bounds). This is the seam
  the rubric requires — the agentic layer (Phase 3B) routes through it too.

### Coordinate frames
The scene is rendered **in the base frame** (world == `base_link`, Z-up), so the
`key.config.json` coordinates and the FK result are directly comparable with no
conversion — the mitigation for the classic frame-mismatch bug.

## The arm (`stylus_arm`)
7 actuated revolute joints — `joint_1`…`joint_6` + `stylus_pitch` — plus a fixed
stylus-tip TCP link (`stylus_tip`), authored in meters, Z-up. Uses only primitive
geometry, so there are no external mesh files to load.

## Roadmap
- **Phase 2** — IK solver (target xyz → joints), GUI joystick + keyboard jog.
- **Phase 3** — voice control → the same `MotionCommand` pipeline.
- **Phase 3B** — agentic NL layer (bonus), gated by the same `validateCommand`.
- **Phase 4** — autonomous 6-digit PIN entry, ±5 mm reach-and-touch per key.
- **Phase 5** — electrical schematic (Wokwi).
