# System Architecture — Dry Run (6-DOF Stylus Arm)

Derived from the code as it stands, not from the phase briefs. Where the code and the
briefs disagree, this document follows the code and says so.

The organizing principle, stated in the README and actually upheld by `lib/motion/`, is
**one motion pipeline, five triggers**. Every input — dashboard sliders, joystick, keyboard,
voice, autonomous PIN — produces a `MotionCommand`, and nothing writes joint angles except
the motion store.

---

## 1. Containers and deployment

Two containers behind Docker Compose, plus one external SaaS dependency. The frontend
container is gated on the backend's healthcheck, and the URDF and panel config are mounted
read-only into the backend, which then *serves them to the browser* — the browser never
reads them from disk.

```mermaid
flowchart TB
    subgraph browser["Operator's browser"]
        UI["Next.js app<br/>React + Three.js + Zustand"]
        MIC["MediaRecorder<br/>push-to-talk mic"]
    end

    subgraph compose["docker compose — iut-techathon-onsite"]
        subgraph fe["frontend container :3000"]
            NEXT["Next.js 14 standalone server"]
        end

        subgraph be["backend container :8000"]
            API["FastAPI + uvicorn"]
        end
    end

    subgraph assets["Read-only bind mounts"]
        URDF["6_dof_arm.urdf"]
        KEYS["key.config.json"]
    end

    EL["ElevenLabs<br/>speech-to-text API<br/>scribe_v1"]

    UI -->|"HTTP :3000"| NEXT
    UI -->|"REST /api/*  CORS *"| API
    MIC -->|"audio blob"| UI
    API -->|"multipart upload<br/>xi-api-key"| EL
    URDF -.->|"/app/6_dof_arm.urdf"| API
    KEYS -.->|"/app/key.config.json"| API
    NEXT -.->|"depends_on: service_healthy"| API

    classDef ext fill:#4a3a1a,stroke:#f2991a,color:#fff
    classDef mount fill:#1e2a3a,stroke:#3a7bd5,color:#fff
    class EL ext
    class URDF,KEYS mount
```

Two facts worth noting because they are easy to get wrong:

The **ElevenLabs API key never reaches the browser.** Next.js inlines every `NEXT_PUBLIC_*`
variable into the client bundle, so audio round-trips through the backend
(`POST /api/voice/transcribe`) rather than the browser calling ElevenLabs directly. This is
called out in both `core/config.py` and `voice/voiceApi.ts`.

The **URDF is served over HTTP, not bundled.** `robot.config.ts` points `URDF_URL` at
`${BACKEND_URL}/api/robot/urdf`, so the backend's mounted copy is the single source of truth
for both the solver and the renderer.

---

## 2. The motion pipeline — five triggers, one path

This is the diagram that matters. Read it as: everything on the left produces a
`MotionCommand`; the safety gate is unavoidable; `jointAngles` is the only authoritative
arm state; the 3D robot is a *renderer* of that state, never an owner of it.

```mermaid
flowchart TB
    subgraph triggers["Input triggers — the five, plus direct 3D drag"]
        T1["JointSliders<br/>dashboard"]
        T2["Joystick"]
        T3["KeyboardJog<br/>WASD / arrows"]
        T4["VoiceControls<br/>push-to-talk"]
        T5["KeyTouchControls<br/>PIN / panel"]
        T6["PointerURDFDragControls<br/>drag a joint in 3D"]
    end

    JOG["useContinuousJog<br/>module-scope ticker<br/>80 ms · one request in flight"]
    CMD["MotionCommand<br/>discriminated union"]
    GATE{"validateCommand<br/>deterministic safety gate"}
    STORE["useMotionStore.dispatch"]

    subgraph auth["Authoritative state — Zustand"]
        JA["jointAngles[7]<br/>radians"]
        EE["eePosition<br/>base frame, meters"]
    end

    subgraph render["Three.js host — RobotScene"]
        LOOP["render loop<br/>60 fps, outside React"]
        ROBOT["URDFRobot<br/>renderer only"]
        FK["forwardKinematics<br/>stylus_tip world pos"]
    end

    BE["Backend IK<br/>/api/ik/solve · /api/motion/jog"]
    DASH["Dashboard readouts<br/>JointReadout · EEReadout · EventLog"]

    T2 --> JOG
    T3 --> JOG
    JOG --> CMD
    T1 --> CMD
    T4 -.->|"resolve only —<br/>dispatch NOT called"| CMD
    T5 --> CMD
    T6 -->|"writes store directly"| JA

    CMD --> STORE
    STORE --> GATE
    GATE -->|"rejected"| REJ["MotionResult<br/>ok: false + reason"]
    GATE -->|"ok"| EXEC["execute"]

    EXEC -->|"move_to · jog_cartesian · touch_key"| BE
    EXEC -->|"set_joint · jog_joint · home · stop"| JA
    BE -->|"joints + trajectory"| JA

    JA --> LOOP
    LOOP --> ROBOT
    ROBOT --> FK
    FK --> EE
    JA --> DASH
    EE --> DASH

    classDef gate fill:#4a1a2a,stroke:#e94b6a,color:#fff
    classDef state fill:#1a3a2a,stroke:#3ad57b,color:#fff
    classDef dormant fill:#2a2a2a,stroke:#777,color:#aaa,stroke-dasharray:4 3
    class GATE gate
    class JA,EE state
    class T4 dormant
```

**The voice trigger is deliberately disarmed.** `VoiceControls.tsx` resolves the transcript
into a command, shows the command and the gate's verdict, and never calls `dispatch()`.
The file says this is so the matcher can be watched against real speech-to-text errors
before it is trusted with motion.

**The 3D drag control is the one trigger that bypasses the gate**, writing `jointAngles`
directly. That is safe only because `setJoint` clamps to the URDF limits on the way in —
the clamp, not the gate, is what protects that path.

---

## 3. Command and result contracts

`commands.ts` is the cross-team interface. Every trigger produces the union on the left;
every dispatch returns the record on the right.

```mermaid
classDiagram
    class MotionCommand {
        <<union>>
    }
    class jog_cartesian {
        delta: Vec3
        frame: world or tool
        continuous: bool
    }
    class move_to {
        target: Vec3
        approach: Vec3
    }
    class set_joint {
        joint: int
        value: rad
    }
    class jog_joint {
        joint: int
        delta: rad
    }
    class touch_key {
        key: string
    }
    class sequence {
        steps: List~MotionCommand~
    }
    class home
    class stop

    class MotionResult {
        commandId: string
        ok: bool
        reachedTarget: bool
        finalJoints: List~number~
        finalEE: Vec3
        error: MotionErrorCode
        reason: string
    }

    class MotionErrorCode {
        <<enumeration>>
        unreachable
        joint_limit
        workspace_bounds
        malformed
        cancelled
    }

    MotionCommand <|-- jog_cartesian
    MotionCommand <|-- move_to
    MotionCommand <|-- set_joint
    MotionCommand <|-- jog_joint
    MotionCommand <|-- touch_key
    MotionCommand <|-- sequence
    MotionCommand <|-- home
    MotionCommand <|-- stop
    sequence o-- MotionCommand : recurses
    MotionResult ..> MotionErrorCode
```

`reason` is human-readable on purpose — it is what a spoken or agentic feedback layer reads
back to the operator when a command is refused.

---

## 4. Backend layering

FastAPI routes are thin. Everything is constructed once via `@lru_cache` singletons in
`dependencies.py`, so the URDF is parsed exactly once per process.

```mermaid
flowchart TB
    subgraph routes["app/api — routers, thin"]
        R1["routes_ik<br/>POST /api/ik/solve"]
        R2["routes_motion<br/>POST /api/motion/jog"]
        R3["routes_panel<br/>GET /api/panel/keys, /config"]
        R4["routes_robot<br/>GET /api/robot/model, /state, /urdf"]
        R5["routes_voice<br/>POST /api/voice/transcribe"]
        R6["routes_pin<br/>POST /api/pin/sequence"]
        R7["routes_hardware<br/>GET /api/hardware/schematic"]
        R8["routes_health<br/>GET /health"]
        R9["websocket_state<br/>WS /ws/state · 5 Hz"]
    end

    subgraph deps["app/dependencies — lru_cache singletons"]
        D["get_robot_model · get_motion_planner<br/>get_state_store · get_panel_service<br/>get_voice_service · get_pin_service"]
    end

    subgraph domain["Domain services"]
        MP["MotionPlanner<br/>solve_target · jog"]
        SV["SafetyValidator<br/>radius ≤ 1.7 m · z ∈ [-0.25, 1.6]"]
        IK["IKSolver<br/>damped least squares"]
        TRAJ["build_joint_trajectory<br/>30 pts · smoothstep · 1200 ms"]
        SS["RobotStateStore"]
        PS["PanelService"]
        VS["VoiceService"]
        PIN["PinService — scaffold"]
        HW["HardwareService — scaffold"]
    end

    subgraph robot["app/robot — kinematics core"]
        UL["urdf_loader<br/>XML → RobotModel + chain"]
        KIN["kinematics<br/>forward_kinematics<br/>numerical_jacobian"]
        LIM["limits<br/>clamp_joint_map"]
    end

    ERR["RobotBackendError → HTTP 400<br/>ValidationError · KinematicsError"]

    R1 --> D
    R2 --> D
    R3 --> D
    R4 --> D
    R5 --> D
    R6 --> D
    R7 --> D
    R9 --> D

    D --> MP
    D --> SS
    D --> PS
    D --> VS
    D --> PIN
    D --> HW

    MP --> SV
    MP --> IK
    MP --> TRAJ
    IK --> KIN
    IK --> LIM
    TRAJ --> KIN
    SS --> KIN
    MP --> UL
    KIN --> UL
    LIM --> UL

    SV -.->|"raises"| ERR
    UL -.->|"raises"| ERR
    VS -.->|"raises"| ERR

    classDef scaffold fill:#2a2a2a,stroke:#777,color:#aaa,stroke-dasharray:4 3
    classDef err fill:#4a1a2a,stroke:#e94b6a,color:#fff
    class PIN,HW scaffold
    class ERR err
```

---

## 5. A Cartesian jog, end to end

The most-exercised path in the app: a joystick deflection becomes an IK solve and a new pose.
Note the two rate-limiting mechanisms — the ticker's in-flight gate on the client, and the
`continuous: true` flag that suppresses trajectory animation so held-down jogs stay responsive.

```mermaid
sequenceDiagram
    autonumber
    participant J as Joystick / Keyboard
    participant T as useContinuousJog<br/>module ticker
    participant S as motionStore
    participant V as validateCommand
    participant A as backendApi
    participant R as routes_motion
    participant P as MotionPlanner
    participant SV as SafetyValidator
    participant IK as IKSolver
    participant SC as RobotScene loop

    J->>T: setVector({x,y,z}) in [-1,1]
    Note over T: tick every 80 ms<br/>skip while a request is in flight
    T->>S: dispatch(jog_cartesian, continuous: true)
    S->>V: validateCommand(cmd)
    V-->>S: ok (finite delta)
    S->>A: POST /api/motion/jog<br/>{delta, currentJoints}
    A->>R: HTTP
    R->>P: planner.jog(currentJoints, delta)
    P->>P: clamp_joint_map(current)
    P->>P: forward_kinematics → current tip
    P->>P: target = tip + delta
    P->>SV: validate_target(target)
    alt outside workspace
        SV-->>R: ValidationError
        R-->>A: 400 {success: false, reason}
        A-->>S: throw
        S->>S: status = error, log rejection
    else inside workspace
        SV-->>P: ok
        P->>IK: solve(target, seed = current)
        loop ≤ 300 iters, up to 8 seeds
            IK->>IK: J = numerical_jacobian (3×7)
            IK->>IK: Δq = Jᵀ(JJᵀ + λ²I)⁻¹ e
            IK->>IK: clip Δq to ±0.18, clamp to limits
        end
        IK-->>P: joints, tip, errorMeters, iterations
        P->>P: build_joint_trajectory (30 pts)
        P-->>R: IKSolveResponse
        R->>R: state_store.set_joints(joints)
        R-->>A: 200 {success, joints, tip, trajectory}
        A-->>S: IkResponse
        Note over S: continuous → animateTrajectory: false<br/>trajectory skipped, snap to final
        S->>S: setJoints(joints), setEEPosition(tip)
    end
    SC->>S: read jointAngles each frame
    SC->>SC: applyJoints → updateMatrixWorld → FK
    SC->>S: setEEPosition(tip) if moved > 0.1 mm
```

The solver is **position-only** (a 3×7 Jacobian, not 6×7), so orientation is unconstrained.
That is why `_build_seeds` tries seven fixed elbow-up/elbow-down postures in addition to the
current pose: with a redundant arm and no orientation constraint, a single seed from a
singular neutral pose converges unreliably.

---

## 6. The voice pipeline

Speech-to-text is the *only* part of voice that lives on the backend. The matcher runs in the
browser, deliberately: `MotionCommand`, `validateCommand`, and `JOINTS` are already defined in
TypeScript, and mirroring them in Pydantic would create two definitions to drift apart.

```mermaid
flowchart TB
    PTT["Hold to speak"] --> MR["useSpeechCapture<br/>MediaRecorder<br/>webm/opus"]
    MR -->|"Blob"| VA["transcribeClip<br/>multipart POST"]
    VA --> BE["POST /api/voice/transcribe"]
    BE --> VSVC["VoiceService<br/>≤ 10 MB · 30 s timeout"]
    VSVC --> EL["ElevenLabs scribe_v1"]
    EL -->|"text"| VSVC
    VSVC -->|"TranscriptionResponse<br/>nothing stored"| VS2["voiceStore.resolveTranscript"]

    VS2 --> M1["normalize<br/>lowercase · strip punct<br/>phrases · synonyms · filler<br/>number words → digits"]
    M1 --> M2["skeletonize<br/>numbers → placeholder<br/>captured as params"]
    M2 --> STOPCHK{"isStop?<br/>Levenshtein ≥ 0.60"}
    STOPCHK -->|"yes"| STOPCMD["stop command<br/>never lost to a threshold"]
    STOPCHK -->|"no"| SCORE["score vs ~120 templates<br/>Levenshtein ratio"]

    SCORE --> DEC{"decide"}
    DEC -->|"best below 0.90"| UNM["unmatched"]
    DEC -->|"margin under 0.05"| AMB["ambiguous<br/>ask, do not guess"]
    DEC -->|"clear winner"| BUILD["template.build(params)"]
    BUILD -->|"params out of domain"| UNM
    BUILD --> GATE2["validateCommand<br/>same gate as every trigger"]

    GATE2 --> RES["Resolution<br/>command + confidence + gate verdict"]
    STOPCMD --> RES
    RES --> TL["TranscriptLog<br/>displayed only"]
    RES -.->|"NOT wired —<br/>one line in Phase 3 slice 2"| DISP["motionStore.dispatch"]

    classDef gate fill:#4a1a2a,stroke:#e94b6a,color:#fff
    classDef ext fill:#4a3a1a,stroke:#f2991a,color:#fff
    classDef dormant fill:#2a2a2a,stroke:#777,color:#aaa,stroke-dasharray:4 3
    class GATE2,STOPCHK gate
    class EL ext
    class DISP dormant
```

Three decisions in `matcher.ts` are load-bearing and worth preserving:

Numbers are extracted **before** scoring. `"rotate base 30 degrees"` and
`"rotate base 45 degrees"` are ~92% similar as raw strings, so a flat 90% threshold would
match one against the other's template and silently discard the argument.

A near-tie is **a question, not a guess.** If the runner-up is within 0.05 of the winner the
matcher returns `ambiguous` rather than picking.

`stop` short-circuits before any scoring, at a much looser 0.60 threshold. A stop lost to a
clipped phoneme is the one failure in this grammar with real consequences; a spurious stop
is harmless.

---

## 7. State ownership

The invariant the codebase enforces: **one authoritative store, everything else derives.**

```mermaid
flowchart TB
    subgraph fe["Frontend"]
        MS["motionStore<br/>jointAngles · eePosition · mode · status · log"]
        VS["voiceStore<br/>transcripts + resolutions"]
        VW["viewerStore<br/>display prefs only"]
        ROB["URDFRobot<br/>derived · renderer"]
        DASH["Dashboard<br/>derived · subscribers"]
    end

    subgraph be["Backend"]
        RSS["RobotStateStore<br/>joints + FK tip"]
        RM["RobotModel<br/>immutable, parsed once"]
    end

    MS -->|"authoritative"| ROB
    MS --> DASH
    ROB -->|"FK writes back"| MS
    VS -.->|"records what was said,<br/>not a fact about the arm"| MS
    VW -.->|"never touches arm state"| ROB

    IKR["/api/ik/solve"] -->|"set_joints"| RSS
    JOGR["/api/motion/jog"] -->|"set_joints"| RSS
    RSS -.->|"read by /api/robot/state<br/>and WS /ws/state"| DEAD["No frontend consumer"]
    RM --> RSS

    classDef auth fill:#1a3a2a,stroke:#3ad57b,color:#fff
    classDef dormant fill:#2a2a2a,stroke:#777,color:#aaa,stroke-dasharray:4 3
    class MS auth
    class DEAD,RSS dormant
```

The backend's `RobotStateStore` is currently **write-only**. `/api/ik/solve` and
`/api/motion/jog` both update it, but no frontend code opens `/ws/state` or reads
`/api/robot/state` — the browser treats each solve as a pure function and keeps the pose
itself. That is a coherent design (the client owns the pose, the server owns the math), but
it means the WebSocket and the state endpoints are presently unexercised, and a second
connected client would not see the first one's motion.

---

## 8. API surface, and what is actually wired

```mermaid
flowchart LR
    subgraph live["Consumed by the frontend"]
        A1["GET /api/robot/urdf<br/>→ urdfLoad.ts"]
        A2["GET /api/panel/config<br/>→ keyConfig.ts"]
        A3["GET /api/panel/keys<br/>→ backendApi.getPanelKeyPosition"]
        A4["POST /api/ik/solve<br/>→ move_to, touch_key"]
        A5["POST /api/motion/jog<br/>→ jog_cartesian"]
        A6["POST /api/voice/transcribe<br/>→ voiceApi.ts"]
    end

    subgraph infra["Infrastructure"]
        A7["GET /health<br/>→ compose healthcheck"]
    end

    subgraph unwired["Implemented, no caller"]
        B1["GET /api/robot/model"]
        B2["GET /api/robot/state"]
        B3["WS /ws/state"]
    end

    subgraph scaffold["Scaffold — returns a placeholder"]
        C1["POST /api/pin/sequence<br/>success: false"]
        C2["GET /api/hardware/schematic<br/>checklist metadata"]
    end

    classDef ok fill:#1a3a2a,stroke:#3ad57b,color:#fff
    classDef dormant fill:#2a2a2a,stroke:#777,color:#aaa,stroke-dasharray:4 3
    classDef scaf fill:#4a3a1a,stroke:#f2991a,color:#fff
    class A1,A2,A3,A4,A5,A6,A7 ok
    class B1,B2,B3 dormant
    class C1,C2 scaf
```

---

## 9. Safety, in layers

Safety is checked more than once, in different places, for different reasons. This is
intentional but the layers are not identical, and the gaps are where bugs will live.

```mermaid
flowchart TB
    IN["A command"] --> L1

    subgraph L1["Layer 1 — frontend safety gate · validate.ts"]
        L1A["joint index in range · finite values"]
        L1B["set_joint within JOINT_LIMITS"]
        L1C["move_to within MAX_REACH_M = 1.7"]
        L1D["sequence recurses into every step"]
    end

    L1 -->|"rejected"| OUT1["MotionResult ok: false<br/>logged, spoken, never sent"]
    L1 -->|"passed"| L2

    subgraph L2["Layer 2 — frontend clamp · store.setJoint"]
        L2A["clamp to JOINT_LIMITS on every write"]
        L2B["ignoreLimits widens the clamp to ±2π<br/>for manual drag only"]
    end

    L2 --> L3

    subgraph L3["Layer 3 — backend safety · SafetyValidator"]
        L3A["finite coordinates"]
        L3B["‖target‖ ≤ workspace_radius_m = 1.7"]
        L3C["min_z ≤ z ≤ max_z  ·  [-0.25, 1.6]"]
    end

    L3 --> L4

    subgraph L4["Layer 4 — solver clamp · limits.py"]
        L4A["clamp_joint_map on the seed"]
        L4B["clamp every IK iterate to URDF limits"]
        L4C["Δq clipped to ±0.18 rad per iteration"]
    end

    L4 --> MOVE["Pose accepted"]

    classDef gate fill:#4a1a2a,stroke:#e94b6a,color:#fff
    class L1,L3 gate
```

Two asymmetries fall out of reading these side by side:

**`jog_joint` and `jog_cartesian` are not bounds-checked at layer 1.** `validate.ts` checks
only that the delta is finite; the comment says the absolute limit is enforced when the delta
is applied, which is true for `jog_joint` (via the clamp) but means a `jog_cartesian` delta
is only bounds-checked once it reaches `SafetyValidator` on the backend.

**The frontend has no z-bound.** `MAX_REACH_M = 1.7` mirrors `workspace_radius_m`, but
nothing on the client mirrors `min_z_m` / `max_z_m`. A `move_to` at `z = -1.0` passes layer 1
and is refused at layer 3 — correct, but the rejection costs a round-trip and surfaces as a
backend error rather than a local one.

**`ignoreLimits` is a viewer affordance, not a safety switch.** It widens the clamp for
dragging, but `validateCommand` still enforces the real URDF limits on every dispatched
command. The gate is not weakened by it.

---

## 10. Known gaps

These are the seams left open in the code, listed so the diagram above is not read as a
description of a finished system.

The **PIN sequencing service is a scaffold.** `PinService.plan_sequence` returns
`success: false` with a message saying approach/touch/retract trajectories land after Phase 2
IK is connected. The frontend has `sequence` and `touch_key` commands that work, so PIN entry
can be composed client-side without the backend endpoint.

**Voice does not execute.** One line in `VoiceControls.tsx` connects the resolved command to
`dispatch()`.

**The keyboard and voice frames disagree.** `KeyboardJog`'s `AXIS_KEYS` maps `ArrowUp → +y`
(a top-down map metaphor); `grammar.ts` maps spoken "forward" to `+x` and "up" to `+z`
(ROS REP-103, robot-centric). Arrow-keying the arm and then saying "move left" move the tip
along different axes. The phase-3 brief recommends changing `AXIS_KEYS`.

**IK is position-only.** Orientation of the stylus is not constrained, so `approach_axis`
from `key.config.json` is currently rendered and reasoned about but not enforced by the
solver — a key press lands the tip at the coordinate without guaranteeing it arrives from
`-z`.
