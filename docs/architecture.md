# System Architecture

This document describes the current architecture of the IUT Techathon final-round
6-DOF stylus-arm simulator. The system is a browser-based robot control suite
with a FastAPI backend for robot metadata, inverse kinematics, motion planning,
PIN sequencing, voice scaffolding, and hardware checklist metadata.

## Architecture Principles

- One motion pipeline: dashboard controls, joystick, keyboard jogs, key touches,
  voice commands, and autonomous PIN entry all produce `MotionCommand`s and go
  through the same safe path: trigger -> MotionCommand -> validate -> IK/planner -> trajectory -> apply joints.
- One robot model: `6_dof_arm.urdf` is the source of truth for the robot chain,
  controlled joints, joint limits, and TCP link.
- One panel model: `key.config.json` is the source of truth for the six test
  panel key coordinates.
- Deterministic safety before motion: frontend command validation and backend
  target validation guard motion before IK results are applied.
- Simulation first: the frontend renders and animates the robot; the backend
  computes model-aware motion plans. No real hardware is controlled by the
  current code.

## System Context

```mermaid
flowchart LR
    User[Operator / Judge] --> Browser[Next.js Browser UI]

    Browser --> Scene[Three.js URDF Viewer]
    Browser --> Controls[Dashboard, Joystick, Keyboard, IK, Key Touch]
    Browser --> MotionStore[Zustand Motion Store]

    Controls --> MotionStore
    MotionStore --> Backend[FastAPI Robot Backend]
    Backend --> MotionStore
    MotionStore --> Scene

    Backend --> URDF[(6_dof_arm.urdf)]
    Backend --> KeyConfig[(key.config.json)]
    Scene -->|GET /api/robot/urdf| Backend
    Scene -->|GET /api/panel/config| Backend

    Backend -. available .-> StateWS[WS /ws/state]
    Browser -. can subscribe .-> StateWS
```

## Runtime Components

| Component          | Main paths                                                            | Responsibility                                                                                                                                  |
| ------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend app       | `frontend/src/app/page.tsx`                                           | Builds the single-screen control dashboard.                                                                                                     |
| 3D scene           | `frontend/src/components/scene/RobotScene.tsx`                        | Owns Three.js, URDF loading, camera, panel rendering, joint dragging, and per-frame FK updates.                                                 |
| Motion store       | `frontend/src/lib/motion/store.ts`                                    | Holds authoritative frontend arm state, validates commands, calls backend motion endpoints, applies trajectories, and feeds dashboard readouts. |
| Motion contracts   | `frontend/src/lib/motion/commands.ts`                                 | Defines shared frontend command/result types for every trigger.                                                                                 |
| Backend API        | `backend/app/main.py`, `backend/app/api/*`                            | Exposes health, robot model/state, IK, jog, panel, PIN, voice, hardware, and websocket routes.                                                  |
| Motion planner     | `backend/app/motion/planner.py`                                       | Validates targets, calls IK, builds trajectories, and handles cartesian jogs.                                                                   |
| IK solver          | `backend/app/robot/ik_solver.py`                                      | Solves position-only IK with damped least squares and multiple seed poses.                                                                      |
| Robot model        | `backend/app/robot/urdf_loader.py`, `backend/app/robot/kinematics.py` | Parses the URDF and performs forward kinematics/Jacobian computation.                                                                           |
| Shared state store | `backend/app/motion/state.py`                                         | Keeps the backend's current joint map and computed TCP snapshot in memory.                                                                      |
| PIN planner        | `backend/app/pin/service.py`                                          | Converts a 6-digit PIN into approach, touch, and retract waypoints per key.                                                                     |
| Panel service      | `backend/app/panel/service.py`                                        | Reads `key.config.json` and returns raw panel config plus key coordinates in the base frame.                                                    |

## Backend Module Diagram

```mermaid
flowchart TB
    FastAPI[FastAPI app<br/>backend/app/main.py]

    FastAPI --> Health[/GET /health/]
    FastAPI --> RobotRoutes[/GET /api/robot/model<br/>GET /api/robot/state<br/>GET /api/robot/urdf/]
    FastAPI --> IKR[/POST /api/ik/solve/]
    FastAPI --> MotionR[/POST /api/motion/jog/]
    FastAPI --> PanelR[/GET /api/panel/keys/]
    FastAPI --> PinR[/POST /api/pin/sequence/]
    FastAPI --> VoiceR[/POST /api/voice/command/]
    FastAPI --> HardwareR[/GET /api/hardware/schematic/]
    FastAPI --> StateSocket[/WS /ws/state/]

    RobotRoutes --> RobotModel[RobotModel]
    IKR --> MotionPlanner[MotionPlanner]
    MotionR --> MotionPlanner
    PinR --> PinService[PinService]
    PinService --> PanelService[PanelService]
    PinService --> MotionPlanner
    PanelR --> PanelService
    VoiceR --> VoiceService[VoiceService scaffold]
    HardwareR --> HardwareService[HardwareService scaffold]
    StateSocket --> RobotStateStore[RobotStateStore]

    MotionPlanner --> Safety[SafetyValidator]
    MotionPlanner --> IKSolver[IKSolver]
    MotionPlanner --> Trajectory[Joint trajectory builder]
    IKSolver --> Kinematics[Forward kinematics<br/>Numerical Jacobian]
    IKSolver --> RobotModel
    Safety --> Settings[ROBOT_* settings]
    RobotModel --> URDF[(6_dof_arm.urdf)]
    PanelService --> KeyConfig[(key.config.json)]
    IKR --> RobotStateStore
    MotionR --> RobotStateStore
```

## Motion Command Flow

The frontend owns the rendered arm state and sends model-aware requests to the
backend whenever a command needs IK or cartesian motion. The demo pipeline is
`trigger -> MotionCommand -> validate -> IK/planner -> trajectory -> apply joints`.
Successful backend responses include final joints, TCP position, error, and a trajectory that the
frontend can animate.

```mermaid
sequenceDiagram
    participant User
    participant UI as Frontend Controls
    participant Store as Zustand Motion Store
    participant Gate as validateCommand
    participant API as FastAPI Backend
    participant Planner as MotionPlanner
    participant IK as IKSolver
    participant State as Backend RobotStateStore
    participant Scene as Three.js Scene

    User->>UI: joystick, keyboard, voice, PIN, IK target, key touch
    UI->>UI: trigger -> MotionCommand
    UI->>Store: dispatch(MotionCommand)
    Store->>Gate: validateCommand(command)
    Gate-->>Store: ok or typed rejection

    alt Command requires backend planning
        Store->>API: POST /api/ik/solve or /api/motion/jog or /api/pin/sequence
        API->>Planner: solve_target or jog
        Planner->>Planner: validate target workspace
        Planner->>IK: solve target from current joints
        IK-->>Planner: joints, tip, error, iterations
        Planner-->>API: trajectory + solve result
        API->>State: set_joints on success
        API-->>Store: JSON response
        Store->>Store: apply trajectory/final joints
    else Local joint/home/stop command
        Store->>Store: update local joint/mode/status state
    end

    Store->>Scene: jointAngles update
    Scene->>Scene: apply joints to URDF and compute FK
    Scene->>Store: update eePosition
```

## Autonomous PIN Flow

PIN planning uses the same backend motion planner as manual motion. Each digit
is expanded into an approach waypoint, touch waypoint, and retract waypoint.
The touch is considered successful only when the backend solve reaches the key
within the configured 5 mm tolerance.

```mermaid
sequenceDiagram
    participant UI as Frontend PIN Control
    participant Backend as POST /api/pin/sequence
    participant Pin as PinService
    participant Panel as PanelService
    participant Planner as MotionPlanner
    participant IK as IKSolver

    UI->>Backend: pin + currentJoints
    Backend->>Pin: plan_sequence(request)
    Pin->>Panel: get_keys()
    Panel-->>Pin: key coordinates from key.config.json

    loop For each digit
        Pin->>Planner: solve approach target
        Planner->>IK: solve
        IK-->>Planner: approach trajectory
        Planner-->>Pin: approach result

        Pin->>Planner: solve touch target
        Planner->>IK: solve
        IK-->>Planner: touch trajectory + error
        Planner-->>Pin: touch result

        Pin->>Planner: solve retract target
        Planner->>IK: solve
        IK-->>Planner: retract trajectory
        Planner-->>Pin: retract result
    end

    Pin-->>Backend: planned steps or first failure
    Backend-->>UI: PinSequenceResponse
```

## State Ownership

```mermaid
flowchart LR
    subgraph Frontend
        Commands[MotionCommand triggers]
        Store[Zustand store<br/>jointAngles, eePosition, mode, status, log]
        Scene[URDF renderer<br/>RobotScene]
        Dashboard[Readouts and event log]
    end

    subgraph Backend
        API[HTTP API]
        BackendState[RobotStateStore<br/>current joint map]
        Planner[Motion planner and IK]
    end

    Commands --> Store
    Store --> API
    API --> Planner
    Planner --> BackendState
    API --> Store
    Store --> Scene
    Scene --> Store
    Store --> Dashboard
```

The frontend `jointAngles` array is the source of truth for what the operator
sees. The backend `RobotStateStore` mirrors successful backend-planned moves and
feeds `/api/robot/state` and `/ws/state`. Because the current websocket stream is
backend-originated, any frontend-only manual joint drag is local unless it is
followed by a backend-planned command.

## API Surface

| Endpoint                      | Purpose                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `GET /health`                 | Backend service health.                                                       |
| `GET /api/robot/model`        | Robot name, base link, TCP link, controlled joints, limits, and neutral pose. |
| `GET /api/robot/state`        | Current backend joint and TCP snapshot.                                       |
| `GET /api/robot/urdf`         | Inline URDF document served by the backend.                                   |
| `POST /api/ik/solve`          | Solve a target TCP position from current joints.                              |
| `POST /api/motion/jog`        | Move the TCP by a cartesian delta through the shared planner.                 |
| `GET /api/panel/config`       | Return the raw panel config used by the Three.js scene.                       |
| `GET /api/panel/keys`         | Return typed six-key coordinates from `key.config.json`.                      |
| `POST /api/pin/sequence`      | Plan approach/touch/retract trajectories for a 6-digit PIN.                   |
| `POST /api/voice/command`     | Current deterministic voice-command scaffold.                                 |
| `GET /api/hardware/schematic` | Current hardware checklist metadata scaffold.                                 |
| `WS /ws/state`                | Periodic backend state snapshot stream.                                       |

## Safety and Validation

```mermaid
flowchart TD
    Input[Motion input] --> FrontendGate[Frontend validateCommand]
    FrontendGate -->|reject| UIError[Typed error in UI log]
    FrontendGate -->|accept| BackendGate[Backend SafetyValidator]
    BackendGate -->|reject| APIError[HTTP error response]
    BackendGate -->|accept| IK[IK solve]
    IK -->|success| Apply[Apply trajectory and final joints]
    IK -->|failure| Failure[Return reason and best error]
```

Frontend validation catches malformed commands, joint-limit violations for
absolute joint commands, invalid PIN formats, and obvious workspace overreach.
Backend validation enforces finite target coordinates, workspace radius, and Z
bounds before IK runs. The IK solver then clamps joint maps to URDF limits and
returns a failure reason if it cannot converge within tolerance.

## Deployment Topology

```mermaid
flowchart TB
    subgraph DockerCompose[docker-compose.yml]
        FrontendContainer[frontend<br/>Next.js app<br/>port 3000]
        BackendContainer[backend<br/>FastAPI + Uvicorn<br/>port 8000]
    end

    Browser[Browser] -->|http://localhost:3000| FrontendContainer
    FrontendContainer -->|serves app configured with NEXT_PUBLIC_BACKEND_URL| Browser
    Browser -->|HTTP API calls to http://localhost:8000| BackendContainer

    BackendContainer --> MountedURDF[/mounted 6_dof_arm.urdf/]
    BackendContainer --> MountedPanel[/mounted key.config.json/]
    BackendContainer --> Healthcheck[container healthcheck<br/>GET /health]
```

Local development can run the frontend with `npm run dev` and the backend with
`uv run uvicorn app.main:app --reload`. Docker Compose runs both services, maps
the frontend to port `3000`, maps the backend to port `8000`, and mounts the URDF
and panel config into the backend container as read-only inputs.

## Current Limitations

- The voice and hardware routes are scaffolds, not completed control systems.
- The current code simulates and plans robot motion; it does not actuate real
  servos or communicate with physical hardware.
- Frontend drag/manual joint updates are local UI state. Backend state is updated
  when successful backend-planned IK or jog requests run.
- The backend state store is in memory. It is suitable for the demo runtime but
  not durable across process restarts.
