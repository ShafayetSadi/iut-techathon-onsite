# System Architecture Deep Dive

This file is the detailed implementation reference for the current dry-run
system. It complements the canonical overview in
[`docs/architecture.md`](../architecture.md).

Use this document when you need the runtime data flow, route-to-service
structure, state ownership model, or the current technical caveats.

## Scope

- `docs/architecture.md`: short, canonical system overview.
- `docs/architecture/system-architecture.md`: contributor-facing implementation
  deep dive.

## 1. Deployment and external dependencies

Two application containers run behind Docker Compose, while speech-to-text and
agent reasoning are external API dependencies managed by the backend.

```mermaid
flowchart TB
    subgraph browser["Operator browser"]
        UI["Next.js app<br/>React + Three.js + Zustand"]
        MIC["MediaRecorder<br/>push-to-talk or typed input"]
    end

    subgraph compose["docker compose"]
        subgraph fe["frontend :3000"]
            NEXT["Next.js standalone app"]
        end

        subgraph be["backend :8000"]
            API["FastAPI + Uvicorn"]
        end
    end

    subgraph assets["Read-only mounted assets"]
        URDF["6_dof_arm.urdf"]
        KEYS["key.config.json"]
    end

    STT["ElevenLabs STT"]
    LLM["OpenRouter LLM"]

    UI -->|"HTTP :3000"| NEXT
    UI -->|"REST /api/*"| API
    MIC --> UI
    API --> STT
    API --> LLM
    URDF -.-> API
    KEYS -.-> API
    NEXT -.->|"depends_on healthcheck"| API
```

Important current truths:

- The browser never receives the ElevenLabs or OpenRouter API keys.
- The browser loads the URDF over `GET /api/robot/urdf`; it does not read the
  model from disk directly.
- `key.config.json` is served through backend routes rather than being treated
  as a frontend-owned source.

## 2. One motion pipeline, many triggers

Different controls change how a command is produced, not how motion is
validated or executed.

```mermaid
flowchart TB
    subgraph triggers["Input triggers"]
        T1["Joint sliders"]
        T2["Joystick"]
        T3["Keyboard jog"]
        T4["Voice controls"]
        T5["Key touch"]
        T6["PIN entry"]
        T7["3D drag"]
    end

    JOG["useContinuousJog<br/>80 ms ticker"]
    CMD["MotionCommand"]
    GATE{"validateCommand"}
    STORE["useMotionStore.dispatch"]

    subgraph state["Frontend authoritative state"]
        JA["jointAngles[7]"]
        EE["eePosition"]
        LOG["event log / status / mode"]
    end

    subgraph render["RobotScene"]
        ROBOT["URDF renderer"]
        FK["forward kinematics readback"]
    end

    subgraph backend["Backend planners"]
        IK["/api/ik/solve"]
        JOGAPI["/api/motion/jog"]
        PINAPI["/api/pin/sequence"]
    end

    T2 --> JOG
    T3 --> JOG
    JOG --> CMD
    T1 --> CMD
    T4 --> CMD
    T5 --> CMD
    T6 --> CMD
    T7 -->|"direct setJoint"| JA

    CMD --> STORE
    STORE --> GATE
    GATE -->|"reject"| LOG
    GATE -->|"accept"| EXEC{"Execution path"}
    EXEC -->|"local"| JA
    EXEC -->|"IK target"| IK
    EXEC -->|"cartesian jog"| JOGAPI
    EXEC -->|"PIN sequence"| PINAPI
    IK --> JA
    JOGAPI --> JA
    PINAPI --> JA
    JA --> ROBOT
    ROBOT --> FK
    FK --> EE
    JA --> LOG
    EE --> LOG
```

Nuances that matter:

- Voice commands use the same `dispatch()` path as other control surfaces after
  transcript resolution.
- Held joystick and keyboard input use the continuous jog ticker so they do not
  flood the backend.
- Direct 3D drag updates joints locally and depends on frontend clamping rather
  than the backend path.

## 3. Backend layering

FastAPI routes are thin. Service objects are created via `@lru_cache` in
`backend/app/dependencies.py`, so the URDF is parsed once per process and
shared across requests.

```mermaid
flowchart TB
    subgraph routes["app/api routers"]
        R1["routes_health"]
        R2["routes_robot"]
        R3["routes_ik"]
        R4["routes_motion"]
        R5["routes_panel"]
        R6["routes_pin"]
        R7["routes_voice"]
        R8["routes_agent"]
        R9["routes_hardware"]
        R10["websocket_state"]
    end

    subgraph deps["dependencies.py singletons"]
        D["robot model, planner, state store,<br/>panel, pin, voice, agent, hardware"]
    end

    subgraph domain["Domain services"]
        MP["MotionPlanner"]
        SV["SafetyValidator"]
        IKS["IKSolver"]
        TRAJ["trajectory builder"]
        STATE["RobotStateStore"]
        PANEL["PanelService"]
        PIN["PinService"]
        VOICE["VoiceService"]
        AGENT["AgentService + AgentCompiler"]
        HW["HardwareService"]
    end

    subgraph model["Robot model"]
        URDFL["urdf_loader"]
        KIN["kinematics"]
        LIM["limits"]
    end

    R1 --> D
    R2 --> D
    R3 --> D
    R4 --> D
    R5 --> D
    R6 --> D
    R7 --> D
    R8 --> D
    R9 --> D
    R10 --> D

    D --> MP
    D --> STATE
    D --> PANEL
    D --> PIN
    D --> VOICE
    D --> AGENT
    D --> HW

    MP --> SV
    MP --> IKS
    MP --> TRAJ
    IKS --> KIN
    IKS --> LIM
    KIN --> URDFL
    LIM --> URDFL
    STATE --> KIN
    PIN --> PANEL
    PIN --> MP
    AGENT --> PANEL
    AGENT --> MP
```

## 4. Core backend routes

| Route | Live behavior |
| --- | --- |
| `GET /health` | Healthcheck used by local/dev runtime and Compose. |
| `GET /api/robot/model` | Returns robot metadata, controlled joints, limits, and neutral pose. Mostly useful for tests and debugging. |
| `GET /api/robot/state` | Returns the backend's in-memory joint/TCP snapshot. |
| `GET /api/robot/urdf` | Returns the mounted URDF XML served inline to the browser. |
| `POST /api/ik/solve` | Solves a target position and updates backend state on success. |
| `POST /api/motion/jog` | Builds a jog target from current tip plus delta and updates backend state on success. |
| `GET /api/panel/config` | Returns raw panel configuration for the scene. |
| `GET /api/panel/keys` | Returns typed key coordinates for control logic. |
| `POST /api/pin/sequence` | Plans approach, touch, and retract waypoints for each PIN digit. |
| `POST /api/voice/transcribe` | Sends uploaded audio to `VoiceService`, which then calls ElevenLabs STT. |
| `POST /api/agent/interpret` | Uses OpenRouter to draft semantic steps, then compiles them into deterministic commands. |
| `GET /api/hardware/schematic` | Returns hardware checklist metadata only. |
| `WS /ws/state` | Streams the backend state snapshot every 0.2 seconds. |

## 5. IK and cartesian jog flow

```mermaid
sequenceDiagram
    autonumber
    participant Input as Joystick / Keyboard / IK target
    participant Store as useMotionStore
    participant Gate as validateCommand
    participant API as backendApi.ts
    participant Route as FastAPI route
    participant Planner as MotionPlanner
    participant Safety as SafetyValidator
    participant Solver as IKSolver
    participant Scene as RobotScene

    Input->>Store: dispatch(command)
    Store->>Gate: validateCommand(command)
    Gate-->>Store: pass or reject

    alt requires backend solve
        Store->>API: POST /api/ik/solve or /api/motion/jog
        API->>Route: HTTP request
        Route->>Planner: solve_target or jog
        Planner->>Safety: validate target
        Safety-->>Planner: accept or raise
        Planner->>Solver: solve(target, current_joints)
        Solver-->>Planner: joints, tip, error, trajectory
        Planner-->>Route: response model
        Route-->>API: JSON
        API-->>Store: typed response
        Store->>Store: apply trajectory or snap to final joints
    else local command
        Store->>Store: update joints/status only
    end

    Store->>Scene: jointAngles changed
    Scene->>Scene: apply joints and compute FK
    Scene->>Store: update eePosition
```

Current solver facts:

- The solver is position-only, not full-pose constrained.
- It uses damped least squares with multiple seed postures.
- The backend clamps joint maps to URDF limits during solving.
- Continuous jogs can skip trajectory animation so repeated inputs stay
  responsive.

## 6. PIN flow

Older notes described PIN planning as a scaffold. That is now stale.
`PinService.plan_sequence()` is implemented and plans the sequence digit by
digit through the shared motion planner.

```mermaid
sequenceDiagram
    participant UI as PIN controls
    participant Route as POST /api/pin/sequence
    participant Pin as PinService
    participant Panel as PanelService
    participant Planner as MotionPlanner

    UI->>Route: pin + currentJoints
    Route->>Pin: plan_sequence(request)
    Pin->>Panel: get_keys()
    Panel-->>Pin: keypad coordinates

    loop each digit
        Pin->>Planner: solve approach target
        Planner-->>Pin: approach result
        Pin->>Planner: solve touch target with 5 mm tolerance
        Planner-->>Pin: touch result
        Pin->>Planner: solve retract target
        Planner-->>Pin: retract result
    end

    Pin-->>Route: per-digit steps + overall success/failure
    Route-->>UI: PinSequenceResponse
```

The key constraint is not just solve success. A touch counts only if the
reported tip error stays within the 5 mm tolerance.

## 7. Voice and agent flow

Voice is a two-stage system:

1. Speech capture and transcription.
2. Deterministic matching first, then agent escalation for ambiguity or
   compound intent.

```mermaid
flowchart TB
    Speech["Speech or typed text"] --> STT["POST /api/voice/transcribe"]
    STT --> Transcript["resolved transcript"]
    Transcript --> Match["matcher.ts + grammar.ts"]

    Match -->|"clear deterministic match"| Cmd["MotionCommand"]
    Match -->|"ambiguous / unmatched / pending plan"| Agent["POST /api/agent/interpret"]

    Agent --> Draft["AgentService drafts semantic plan<br/>via OpenRouter"]
    Draft --> Compile["AgentCompiler compiles plan<br/>into deterministic commands"]
    Compile --> Cmd

    Cmd --> Gate["validateCommand"]
    Gate --> Dispatch["useMotionStore.dispatch"]
```

Important current behavior:

- STT lives on the backend because secrets must stay off the client.
- The deterministic matcher still gets first chance.
- The agent does not directly actuate anything; it returns a command or
  sequence that must still pass the normal motion pipeline.
- Clarification turns are supported through `pendingPlan` state in the frontend
  voice store.

## 8. State ownership

The frontend and backend both hold state, but they play different roles.

```mermaid
flowchart LR
    subgraph frontend["Frontend"]
        MS["motionStore<br/>authoritative visible pose"]
        VS["voiceStore<br/>transcripts and agent context"]
        VIEW["viewerStore<br/>display preferences"]
        SCENE["RobotScene"]
    end

    subgraph backend["Backend"]
        RSS["RobotStateStore<br/>in-memory snapshot"]
    end

    MS --> SCENE
    SCENE --> MS
    VS -. context only .-> MS
    VIEW -. display only .-> SCENE
    MS -->|"backend-planned moves"| RSS
```

The frontend `motionStore` is still the source of truth for what the operator
sees. The backend `RobotStateStore` mirrors successful backend-planned moves and
supports `/api/robot/state` and `/ws/state`, but the current frontend does not
depend on those endpoints for rendering.

## 9. Safety layers

```mermaid
flowchart TB
    Command --> FrontendGate["Frontend validateCommand"]
    FrontendGate --> FrontendClamp["Frontend joint clamp on writes"]
    FrontendClamp --> BackendGate["Backend SafetyValidator"]
    BackendGate --> IKClamp["IK iterate clamp to URDF limits"]
    IKClamp --> Accepted["motion accepted"]
```

What each layer covers today:

- `validate.ts`: malformed values, joint index/range issues, obvious workspace
  overreach, invalid PIN shapes, and command-structure problems.
- `store.ts`: clamps direct joint writes to configured limits, with a widened
  viewer-only range when `ignoreLimits` is enabled for drag interaction.
- `SafetyValidator`: finite cartesian target checks plus workspace radius and Z
  bounds.
- IK iteration limits: every iterate is clipped and clamped to URDF limits.

## 10. Current limitations

- The hardware route is still documentation/checklist metadata, not a live
  hardware controller.
- The system does not persist arm state across backend restarts.
- The websocket stream exists, but the current UI does not use it for
  rendering.
- Stylus orientation is not yet a hard IK objective.
- This remains a simulator/demo architecture, not a real-time industrial
  control stack.
