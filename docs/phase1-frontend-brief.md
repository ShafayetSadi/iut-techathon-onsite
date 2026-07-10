# Phase 1 — Frontend Working Brief (Dry Run / Vantage Arm)

**Owner:** Frontend / UI-UX
**Consumed by:** Claude Code in the IDE
**Goal of this doc:** give Claude Code enough context to build Phase 1 correctly *and* in a way the rest of the pipeline (IK, voice, autonomous PIN, agentic) can plug into without a rewrite.

> Core principle carried from the problem statement: **one motion pipeline, five triggers.** Everything the frontend builds is a *view of* or a *trigger into* one authoritative motion store. Never build a feature that owns its own copy of arm state.

---

## 1. Scope of Phase 1 (what "done" means)

Three deliverables, nothing more:

1. **Load + render the URDF** in a web-based 3D viewer.
2. **Live dashboard** — current joint angles + end-effector (EE) position, updating every frame.
3. **Render the 6-key panel** from `key.config.json` (six boxes at the given coordinates is enough; digit labels are a bonus).

Plus one non-negotiable prerequisite that isn't in the rubric but silently breaks everything downstream:

0. **Coordinate-frame sanity check** (see §7). Do this *before* trusting the panel or any motion.

---

## 2. Stack decisions

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js + React + TypeScript | Team's existing stack |
| 3D | Three.js + `urdf-loader` | Mandated by problem statement |
| React↔Three glue | **Vanilla Three.js in one mounted component** for Phase 1 | `urdf-loader` is imperative; wrapping it in R3F costs time we don't have on day 1. Can migrate later if wanted. |
| State | **Zustand** | The one store both the React dashboard *and* the Three.js render loop read/write. Works outside React's render cycle — no re-render storm when joints update 60x/sec. This is our single source of truth. |

> Decision to confirm with the team, not assume: R3F vs vanilla. Recommendation above is vanilla-for-speed. If someone strongly prefers R3F, flag it in the 0:00–0:30 sync, not mid-build.

---

## 3. Architecture — single source of truth

```
             dispatch(command)
UI triggers ───────────────────►  Motion Store (Zustand)  ──► Robot Adapter ──► Three.js URDF robot
(dashboard, joystick,               │  authoritative:            (applies joints,
 keyboard, voice, PIN)              │  jointAngles, eePos,        computes FK)
                                    │  target, mode, log
      Dashboard ◄───── subscribes ──┘
```

Rules:
- **`jointAngles` in the store is the only truth.** The URDF robot object is a *renderer* of that truth, never an independent state holder.
- The render loop reads `jointAngles` from the store and pushes them onto the URDF each frame; it computes EE position via forward kinematics and writes `eePosition` back to the store.
- The dashboard only *reads* the store. It never talks to Three.js directly.

---

## 4. Shared contracts (lock these in the 0:00–0:30 sync)

These are cross-team interfaces. Everyone codes against them. Put them in `/lib/motion/commands.ts`.

```ts
type Vec3 = { x: number; y: number; z: number };

// The ONE thing all five triggers produce.
type MotionCommand =
  | { type: 'jog_cartesian'; axis: 'x' | 'y' | 'z'; delta: number; frame?: 'world' | 'tool' }
  | { type: 'move_to'; target: Vec3; approach?: Vec3 }   // IK targeting + PIN
  | { type: 'set_joint'; joint: number; value: number }  // absolute radians
  | { type: 'jog_joint'; joint: number; delta: number }  // e.g. "rotate base 30°"
  | { type: 'touch_key'; key: string }                   // resolves via key.config.json
  | { type: 'sequence'; steps: MotionCommand[] }          // PIN entry
  | { type: 'home' }
  | { type: 'stop' };

// What every command returns. Voice/agentic feedback + PIN success detection read this.
interface MotionResult {
  commandId: string;
  ok: boolean;
  reachedTarget?: boolean;                    // within tolerance (±5mm for touch)
  finalJoints?: number[];
  finalEE?: Vec3;
  error?: 'unreachable' | 'joint_limit' | 'workspace_bounds' | 'malformed' | 'cancelled';
  reason?: string;                            // human-readable, for spoken/agentic feedback
}
```

```ts
// /lib/motion/store.ts  (Zustand)
interface MotionState {
  jointAngles: number[];                 // authoritative, radians
  jointLimits: [number, number][];       // from URDF
  jointNames: string[];
  eePosition: Vec3;                      // computed via FK each frame
  target: Vec3 | null;
  mode: 'idle' | 'jog' | 'voice' | 'auto';
  status: 'ready' | 'moving' | 'error';
  log: { t: number; text: string; level: 'info' | 'ok' | 'error' }[];

  // actions
  dispatch: (cmd: MotionCommand) => Promise<MotionResult>;  // goes through validate() first
  setJoints: (angles: number[]) => void;                    // low-level, used by animation loop
  pushLog: (text: string, level?: 'info' | 'ok' | 'error') => void;
}
```

```ts
// /lib/motion/validate.ts — deterministic safety gate. EVERY command passes here before motion.
// Phase 1 stub is fine (joint-limit check only); IK/bounds fill in later.
// The agentic layer (3B) is REQUIRED to route through this — judges mark down ungated agents.
function validateCommand(cmd: MotionCommand): { ok: true } | { ok: false; error: MotionResult['error']; reason: string };
```

> Even though Phase 1 doesn't move the arm autonomously, defining `dispatch` + `validate` now means IK, voice, and PIN just *produce commands* — they never touch joints directly.

---

## 5. File / folder structure

```
src/
  app/                      # Next.js app router
  components/
    scene/
      RobotScene.tsx        # the one Three.js host component
      Panel.tsx             # 6-key panel from config
      TestMarker.tsx        # debug sphere for §7 sanity check
    dashboard/
      JointReadout.tsx      # live joint angles
      EEReadout.tsx         # live end-effector xyz
      ModeStatus.tsx        # mode + status pill
      EventLog.tsx          # scrolling command/result log
  lib/
    robot/
      urdfLoad.ts           # load + parse URDF, return robot object
      robotAdapter.ts       # setJoints(robot, angles), fk(robot) -> eePos
    motion/
      commands.ts           # MotionCommand / MotionResult (contracts)
      store.ts              # Zustand store
      validate.ts           # deterministic safety gate
  config/
    key.config.json         # PROVIDED — do not edit
    robot.config.ts         # joint names, limits, units, EE link name (fill after inspection)
```

Branch ownership: this whole tree minus `components/controls/` (Person 3) is Phase-1 frontend. Keep `motion/` contracts on `main` early so others build against them.

---

## 6. Phase 1 task order (for Claude Code)

Scope each task narrowly. Don't ask Claude Code to "build Phase 1" in one prompt — feed it these in order:

1. **Scene bootstrap** — `RobotScene.tsx`: canvas, perspective camera, hemisphere + directional light, `OrbitControls`, ground grid. Resize-safe. Renders an empty scene.
2. **URDF load** — `urdfLoad.ts` + wire into scene. Arm appears. Log joint names + limits to console (feeds `robot.config.ts`).
3. **Store + adapter** — `store.ts` with `jointAngles`/`setJoints`, `robotAdapter.ts` to apply angles to the URDF and compute EE via FK. Render loop: read store → apply → write `eePosition` back.
4. **Dashboard** — `JointReadout`, `EEReadout`, `ModeStatus`, `EventLog`, all subscribing to the store. Must update live.
5. **Panel** — `Panel.tsx` reads `key.config.json`, renders six boxes at the coords. (Digit labels = bonus.)
6. **Integration proof** — a temporary debug slider that calls `setJoints`; confirm the arm moves *and* the dashboard numbers move together. This is the team's 1:30 milestone from my seat.

---

## 7. Risks that specifically threaten Phase 1

**Risk A — coordinate frames (highest danger).** URDF base frame, Three.js world frame, the panel's frame, and later the IK frame must agree. Mitigation, do this in task 5 before trusting anything:
- Read one key coordinate from `key.config.json`.
- Drop a `TestMarker` sphere at that exact coordinate in world space.
- Visually confirm it sits where the panel key should be, relative to the arm base.
- Check **units** (URDF is usually meters; confirm the config isn't in mm). A silent m/mm mismatch is the classic "PIN entry misses every key" bug.

**Risk B — two sources of truth.** Do not let React state and the Three.js robot hold joint values independently. Store is authoritative; the robot is a renderer. (This is why we picked Zustand.)

---

## 8. Unknowns to resolve on resource inspection

Fill these into `robot.config.ts` once the URDF + config are in hand:

- [ ] Joint names + order (URDF)
- [ ] Joint limits (lower/upper, radians)
- [ ] End-effector / stylus-tip link name (for FK)
- [ ] Coordinate units (URDF vs `key.config.json`)
- [ ] `key.config.json` shape — object keyed by digit, or array? Confirm before writing `Panel.tsx`.
- [ ] Base-frame origin + up-axis (Three.js default up is +Y; many URDFs are +Z — may need a root rotation)

---

## 9. Definition of Done (Phase 1)

- Arm renders from the provided URDF; orbit/zoom works.
- 6-key panel visible at correct coordinates; test marker confirmed the frame is right.
- Dashboard shows live joint angles + EE xyz, updating each frame.
- Moving one joint through the store updates **both** the 3D arm and the dashboard numbers.
- No component holds arm state outside the Zustand store.

Hitting this = the shared spine is proven, and IK / voice / PIN can all bolt on by producing `MotionCommand`s. That's the whole point.
