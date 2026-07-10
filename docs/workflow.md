# Operator Workflow

End-to-end workflow of the 6-DOF stylus-arm simulator: from mode selection,
through command validation and motion planning, to the rendered result on
screen. This complements the component/sequence diagrams in
[architecture.md](architecture.md) with a single top-to-bottom view of the
whole operator journey.

```mermaid
flowchart TD
    Start([Operator opens the app]) --> Load[Frontend loads robot model + panel config<br/>GET /api/robot/model, /api/panel/config]
    Load --> ChooseMode{Select control mode<br/>in ControlSidebar}

    ChooseMode -->|Manual| Manual[Joystick / Keyboard jog /<br/>IK target / Joint sliders]
    ChooseMode -->|Panel| Panel[Autonomous PIN entry<br/>or manual key touch]
    ChooseMode -->|Voice| Voice[Speak a command]

    Voice --> STT[Audio -> POST /api/voice/command<br/>-> ElevenLabs STT]
    STT --> Parse[matcher.ts / grammar.ts parse<br/>transcript into a MotionCommand]

    Manual --> Command[MotionCommand]
    Panel --> Command
    Parse --> Command

    Command --> Dispatch[dispatch to Zustand Motion Store]
    Dispatch --> FValidate{Frontend<br/>validateCommand}

    FValidate -->|reject| LogError[Typed error in Event Log]
    FValidate -->|accept| NeedsBackend{Needs IK /<br/>cartesian planning?}

    NeedsBackend -->|No: home / stop / absolute joint| LocalUpdate[Update store state directly]
    NeedsBackend -->|Yes| BackendCall[POST /api/ik/solve,<br/>/api/motion/jog, or /api/pin/sequence]

    BackendCall --> BValidate{Backend<br/>SafetyValidator}
    BValidate -->|reject| APIError[HTTP error response] --> LogError
    BValidate -->|accept| IKSolve[IKSolver: damped least squares<br/>over FK / Jacobian]

    IKSolve -->|converged| Trajectory[Build joint trajectory]
    IKSolve -->|failed| PlanFail[Return failure reason] --> LogError

    Trajectory --> UpdateState[Update backend RobotStateStore]
    UpdateState --> ReturnPlan[Return joints, TCP, trajectory<br/>to frontend]
    ReturnPlan --> LocalUpdate

    LocalUpdate --> AnimateScene[RobotScene applies joint angles<br/>to the URDF model, frame by frame]
    AnimateScene --> FK[Compute forward kinematics]
    FK --> WriteEE[Write end-effector position<br/>back to the store]
    WriteEE --> Dashboard[Dashboard updates:<br/>JointReadout, EEReadout,<br/>ModeStatus, EventLog]
    Dashboard --> ChooseMode
```

## PIN sequence detail

The Panel mode's autonomous PIN entry drives the same planner once per digit,
expanding each digit into approach, touch, and retract waypoints:

```mermaid
flowchart LR
    PIN[6-digit PIN] --> Loop{For each digit}
    Loop --> Approach[Plan approach waypoint] --> Touch[Plan touch waypoint<br/>within 5mm tolerance] --> Retract[Plan retract waypoint]
    Retract -->|next digit| Loop
    Loop -->|done| Done[Full plan returned to frontend for animation]
```
