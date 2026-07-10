# Dry Run

## 1. The Story

Vantage Robotics builds and sells a 6-axis industrial robotic arm used on factory floors for precision assembly and inspection work. Every arm that ships runs on the same control software, and that software is under constant development — new motion modes, new interfaces, new automation features, all being written and tested continuously.

The problem is where that testing happens. Right now, every change to the control software — a tweak to the IK solver, a new control scheme, a new automated routine — gets tested on an actual arm on the floor.

That is slow: engineers queue up for limited arm time.

It is risky: a bug in untested motion code can crash the arm into a fixture, damage the tooling, or injure someone standing nearby.

And it is expensive: every hour the arm spends running test code is an hour it isn't doing production work.

Vantage's engineering leadership has decided this has to change. Before any control software touches a real arm, it should be built and proven entirely in a browser-based simulation — one that behaves like the real thing closely enough that engineers, operators, and even non-technical stakeholders can trust what they see in it.

Only software that passes muster in simulation gets a shot on real hardware.

Your team has been brought in to build that simulation and control suite. Vantage has handed over:

- The URDF model of their arm.
- The fixed coordinates of a standard test fixture.
- A 6-key panel used across their test rigs to validate precision and repeatability.

Everything else is what your team is building:

- Visualizing the arm.
- Driving it manually in multiple ways.
- Commanding it through voice or natural language.
- Proving that it can complete a precise task fully autonomously.

Vantage's floor supervisors are not always the engineers writing the control code. They've asked for one more thing:

Could an operator eventually just talk to the arm?

For example:

- Describe what they want in plain language.
- Have the instruction understood correctly.
- Hear a clear confirmation of what was done.
- Receive a clear spoken warning when something could not be done.

Teams that want to push further can build toward that vision as an optional, separately scored extension of the same pipeline.

---

## 2. The Problem Statement

Build a web application that lets Vantage's engineers visualize, manually control, and eventually automate a **6-DOF industrial robotic arm** — entirely in a browser, with no real hardware involved.

The arm has no gripper — only a fixed stylus tip, standard across Vantage's test rigs.

A 6-key test panel sits at known, fixed coordinates relative to the arm's base.

Your application must let an engineer drive the arm manually through several control methods, then extend that same motion pipeline into an autonomous mode that completes a precise task:

> Entering a given PIN by touching the correct keys in sequence — entirely on its own.

At its core, this is a **single motion-control pipeline** reused across five different ways of triggering it:

1. Dashboard
2. GUI joystick
3. Keyboard
4. Voice command
5. Autonomous sequence

If this pipeline is solid and trustworthy in simulation, Vantage can be confident handing the same software a real arm.

Everything you build should point back to that one pipeline.

### Optional Extension — Agentic Voice Control

Teams that complete the core pipeline may optionally extend it further.

Instead of mapping a fixed set of keyword commands directly to motion, route spoken or typed natural language through a reasoning layer — of any kind you choose — that:

- Interprets free-form instructions.
- Handles multi-step instructions.
- Handles ambiguous instructions.
- Converts natural language into the same structured motion commands the pipeline already understands.
- Confirms what it understood.
- Reports whether the action succeeded.
- Explains why an action failed or could not be attempted.

---

## 3. What You're Given vs. What You Build

| Provided by Organizers                                                                              | Built by Teams                                                                |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| URDF file of the 6-DOF robotic arm with no gripper and a fixed stylus end-effector                  | Web-based 3D dashboard to visualize and move the arm                          |
| Fixed 3D coordinates of the 6-key test panel in the arm's base frame, provided as `key.config.json` | Visual representation of the 6-key test panel placed at the given coordinates |
| This problem statement and judging rubric                                                           | Inverse kinematics solver                                                     |
| —                                                                                                   | Joystick-style GUI control                                                    |
| —                                                                                                   | Keyboard-based control                                                        |
| —                                                                                                   | Voice-based control                                                           |
| —                                                                                                   | Autonomous PIN-entry model                                                    |
| —                                                                                                   | Arm's electrical schematic                                                    |
| —                                                                                                   | Optional agentic natural-language voice-to-control layer                      |

---

## 4. Tasks

## Phase 1 — See the Arm

### 1. Load and Render the URDF

Load and render the provided URDF in a web-based 3D viewer.

Example technologies:

- Three.js
- `urdf-loader`

### 2. Build the Dashboard

Build a dashboard showing:

- Current joint angles.
- Current end-effector position.
- Live updates as the arm moves.

### 3. Render the Test Panel

Render the 6-key test panel in the same 3D scene using the coordinates from:

```text
key.config.json
```

A simple representation is enough.

For example:

- Six colored boxes.
- Positioned according to the supplied coordinates.
- Clearly visible next to the robotic arm.

The important requirement is **correct placement**, not complex visual design.

---

## Phase 2 — Move the Arm

### 1. Implement Inverse Kinematics

Given a target stylus-tip position:

```text
(x, y, z)
```

compute the joint angles needed to reach that position.

In simple terms:

```text
Target Position
      ↓
Inverse Kinematics Solver
      ↓
Joint Angles
      ↓
Robotic Arm Movement
```

### 2. Build GUI Joystick Control

Build an on-screen joystick-style control that lets the operator jog the end-effector in real time.

Example directions could include:

```text
+X
-X
+Y
-Y
+Z
-Z
```

These directions should modify the end-effector target position and send the resulting target through the shared motion pipeline.

### 3. Add Keyboard Controls

Add keyboard controls as an alternative way to jog the same motion.

Examples:

- Arrow keys
- WASD
- Modifier keys

The keyboard controls and GUI joystick should use the same underlying motion system.

---

## Phase 3 — Talk to the Arm

### 1. Add Voice Control

Add voice control that maps spoken commands to the same motion pipeline used by the other control modes.

Example commands:

```text
"move up"
```

```text
"move left"
```

```text
"rotate base 30 degrees"
```

How speech is captured and understood is entirely up to the team.

The important architecture is:

```text
Speech
   ↓
Speech Recognition
   ↓
Command Interpretation
   ↓
Structured Motion Command
   ↓
Shared Motion Pipeline
   ↓
Arm Movement
```

### 2. Optional Agentic Extension

Optionally extend the voice control system into a fully agentic, conversational control layer.

See **Phase 3B — Agentic Voice Control** below.

---

## Phase 4 — Let the Arm Work on Its Own

### 1. Autonomous PIN Entry

Given a **6-digit PIN** as input, make the arm autonomously sequence through the correct test-panel coordinates using the provided configuration file.

For every digit:

```text
Read Digit
    ↓
Find Key Coordinate
    ↓
Move Above Key
    ↓
Move Downward
    ↓
Touch Key
    ↓
Move Back Up
    ↓
Continue to Next Digit
```

The arm must perform the operation for all six digits, in order.

### 2. Successful Key Press Condition

A key press is successful when the stylus tip reaches within a defined tolerance of the target key coordinates.

Example tolerance:

```text
±5 mm
```

Physics-based collision or contact detection is **not required**.

This is a:

> Kinematic reach-and-touch check, not a physics simulation.

---

## Phase 5 — Arm's Electrical Schematic

A 6-DOF robotic arm is powered by servo motors and remotely controlled over Wi-Fi.

Develop a suitable proof-of-concept electrical circuit diagram.

The schematic should demonstrate the required electrical architecture for:

- Power delivery.
- Servo motors.
- Microcontroller.
- Motor or servo driving stage where applicable.
- Wi-Fi communication.
- Logical and clearly labeled connections.

---

## 5. Optional Extension

## Phase 3B — Agentic Voice Control

### 1. Add a Reasoning Layer

Extend the fixed command-mapping system with a reasoning layer of your choice.

This may use:

- An LLM.
- An agentic framework.
- Another suitable natural-language reasoning system.

The system should interpret:

- Free-form instructions.
- Multi-step instructions.
- Ambiguous instructions.

It must convert these instructions into the **same structured motion commands** already supported by the motion pipeline.

Example instruction:

```text
"Nudge the tip a couple centimeters toward the panel and tap the 5 key twice."
```

A possible structured interpretation might conceptually become:

```text
1. Move toward panel by 2 cm
2. Move to key 5 approach position
3. Touch key 5
4. Retract
5. Touch key 5 again
6. Retract
```

### 2. Respond to the Operator

The reasoning layer must respond to the operator in natural language.

Optionally, the response may also be spoken.

It should:

1. Confirm what it understood.
2. Execute the validated action.
3. Report the outcome.

Possible successful response:

```text
"I understood that you want me to move toward the panel and press key 5 twice. The operation completed successfully."
```

Possible failure response:

```text
"I couldn't complete the movement because the requested target is outside the arm's reachable workspace."
```

When an instruction is ambiguous, the system should ask a clarifying question instead of guessing.

### 3. Deterministic Safety Validation

Every command produced by the reasoning layer must pass through a deterministic safety check before any motion executes.

Validation should include:

- Reachability.
- Joint limits.
- Workspace bounds.
- Command format validation.

The architecture should follow this pattern:

```text
Natural Language
       ↓
Reasoning Layer
       ↓
Structured Motion Command
       ↓
Deterministic Safety Validation
       ↓
   ┌───────────────┐
   │ Valid Command?│
   └───────┬───────┘
           │
      Yes  │  No
           │
           ↓
     Execute Motion

No → Reject / Re-prompt / Ask Clarifying Question
```

Out-of-bounds or malformed output must never be executed blindly.

### 4. Technology Freedom

Teams may choose any:

- Speech-to-text provider.
- Text-to-speech provider.
- LLM.
- Agent framework.
- Hosted solution.
- Local solution.
- Open-source solution.
- API-based solution.

There is no restriction on the toolchain.

Judges evaluate the **resulting behavior**, not the specific provider or technology used.

---

## 6. Constraints & Assumptions

- No real hardware is involved. This is intentional and mirrors Vantage's policy that nothing gets near a physical arm until it is proven in simulation.

- Everything runs in-browser using the provided URDF.

- The end-effector is a fixed stylus matching the standard tooling used on Vantage's test rigs.

- There is no gripper.

- There is no grasping task.

- The test panel has no provided visual asset.

- Only the coordinates are provided through `key.config.json`.

- Teams are responsible for rendering the test panel.

- A simple representation, such as six colored boxes, is sufficient.

- Digit labels on the panel are not required for the core deliverable.

- Adding digit labels can be attempted as a bonus feature.

- Input to the autonomous mode is always a **6-digit PIN**.

- Teams may use any frontend web framework or library.

- Teams may use any programming language for a backend or IK service, if a backend service is used.

- Teams may use any speech recognition, speech synthesis, LLM, or agent framework/provider for the optional Phase 3B extension.

- Solutions may be hosted, local, open-source, or commercial.

- Organizers do not mandate or favor any specific tool, model, or vendor.

- Teams pursuing Phase 3B are responsible for their own API keys, model access, and associated costs.

- The optional agentic extension does **not replace** the required deterministic voice-control system from Phase 3.

- The deterministic voice-control baseline must work independently.

- Every command generated by an agentic or reasoning system must pass through deterministic safety and validation checks before it can move the arm.

- An ungated agent that can send arbitrary or unchecked motion commands will lose marks under **Architecture & Safety**, regardless of how capable the agent appears.

---

## 7. Evaluation Criteria

| Criterion                                         | What We're Looking For                                                                                                                                        |     Weight |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------: |
| Visualization & Dashboard                         | URDF loads correctly; arm renders in 3D; joint states are visible and updated live.                                                                           |        15% |
| Inverse Kinematics                                | Given a target position, the arm computes and reaches it correctly and smoothly.                                                                              |        15% |
| Manual Control — GUI Joystick + Keyboard          | Both control modes work, feel responsive, and map intuitively to arm motion.                                                                                  |        10% |
| Voice Control                                     | Speech commands in natural language are correctly recognized and translated into accurate arm movement.                                                       |        15% |
| Autonomous PIN Entry                              | Given a PIN, the arm sequences correctly to each key's known coordinate and "presses" it.                                                                     |        20% |
| Arm's Electrical Schematic                        | Correctly shows power delivery, microcontroller/driver stage, and Wi-Fi link; connections are labeled and logically consistent. Show a Wokwi circuit diagram. |         5% |
| Overall System Architecture & Concept Explanation | A high-level system workflow with proper explanation and understanding. Teams need to explain their engineering rationale to the judges.                      |        15% |
| Overall Polish & Presentation                     | UI/UX quality, code clarity, and how well the team tells the story of the build.                                                                              |         5% |
| Agentic Bonus Phase — 3B                          | Accuracy of NLP-to-motion conversion, speech feedback quality, and validation robustness.                                                                     | +10% Bonus |

### Scoring Notes

The core rubric totals:

```text
100%
```

The Agentic Extension is scored independently as bonus credit on top of the 100%.

Therefore:

- Teams completing only the required core are not penalized for skipping the optional extension.
- Teams implementing the agentic extension well can score above 100%.
- Additional bonus features may earn extra credit at the judges' discretion.
- Bonus features are not required to score well in the core categories.

---

## 8. Deliverables

### Required

- A working web application demonstrating **Phases 1–5**.

- A source code repository containing:

  - Application source code.
  - System diagrams.
  - Arm electrical schematic.

### Bonus

- A deployed URL.

- A short live demo video presented as though the team is demonstrating the system to Vantage's engineering team.

The demo should show:

1. The robotic arm being visualized.
2. Manual movement using the GUI joystick.
3. Manual movement using the keyboard.
4. Voice-based control.
5. Free-form spoken control, when implemented.
6. A PIN being submitted.
7. The arm autonomously typing the PIN from start to finish.

The final demonstration should communicate that the shared motion-control pipeline is reliable enough to be trusted before deployment to real hardware.
