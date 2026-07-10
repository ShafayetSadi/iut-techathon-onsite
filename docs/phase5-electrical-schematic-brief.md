# Phase 5 — Arm's Electrical Schematic (Wokwi PoC)

**Goal of this doc:** get you to a Wokwi diagram that satisfies the rubric line item directly:

> *"Correctly shows power delivery, microcontroller/driver stage, and Wi-Fi link; connections labeled and logically consistent. Show a wokwi circuit diagram."* — 5%

This is a **proof-of-concept** circuit, not the real Vantage hardware. The point is to demonstrate you understand the electrical architecture pattern (wireless MCU → driver stage → actuators, with correctly separated power rails) — not to spec exact industrial servo drives.

---

## 1. Decided: 6 servo channels, one per joint

Matching the problem statement's "6-DOF arm" framing directly — `stylus_pitch` (the 7th actuated joint in the actual URDF) is out of scope for this PoC circuit:

| Servo | Joint |
|---|---|
| Servo 1 | Base rotation (`joint_1`) |
| Servo 2 | Shoulder (`joint_2`) |
| Servo 3 | Elbow (`joint_3`) |
| Servo 4 | Wrist joint 1 (`joint_4`) |
| Servo 5 | Wrist joint 2 (`joint_5`) |
| Servo 6 | Wrist joint 3 (`joint_6`) |

---

## 2. Component list + why each one

| Component | Choice | Why |
|---|---|---|
| MCU + Wi-Fi | **ESP32 DevKit** (`wokwi-esp32-devkit-v1`) | Wi-Fi built in — satisfies "Wi-Fi link" without a separate module. Also has a hardware PWM peripheral (LEDC) with far more than 6 channels available, well-supported in Wokwi. |
| Driver stage | **ESP32's own LEDC hardware PWM**, direct-GPIO to each servo | The rubric calls out "microcontroller/driver stage" as its own thing — the ESP32's hardware PWM generator *is* that stage here, not a rubber-stamped afterthought. The "textbook" upgrade for a real build is a dedicated **PCA9685** I2C driver (offloads PWM timing from a Wi-Fi-busy CPU, frees up GPIOs) — not used in the actual Wokwi file because PCA9685 isn't a native Wokwi part (only a fragile community custom-chip); state this explicitly to judges as a deliberate PoC simplification, not an oversight. |
| Actuators | 6× hobby servo (`wokwi-servo`, label as SG90/MG996R-class) | Standard PoC stand-in for the real arm's servo motors. |
| Servo power | **Separate external 5–6V supply** (`wokwi-9v-battery` used as a labeled stand-in — Wokwi has no generic variable-voltage supply part; the exact battery voltage isn't simulated/enforced) | **This is the single most important thing graders look for.** Servos draw current spikes (stall current can hit ~1A each); powering them from the ESP32's own regulator will brown out the MCU mid-motion. Always a separate high-current rail — and now the diagram actually shows one, not just a verbal claim. |
| Logic power | ESP32's own 5V USB / regulator input | Stays isolated from the servo rail except for a shared ground. |
| Common ground | Wire tying servo-supply `-` and ESP32 `GND` together | **Non-negotiable.** Without a shared ground reference, the PWM signal from the ESP32 has no valid reference at the servo — it won't respond correctly or at all. This is the #1 thing "connections... logically consistent" is checking for. |

---

## 3. Architecture at a glance

```
     Browser / Operator Interface
                │
                │ Wi-Fi
                ▼
             ESP32
   (Wi-Fi stack + hardware LEDC PWM)
                │
      ┌─────┬─────┬─────┬─────┬─────┐
      │     │     │     │     │     │
     S1    S2    S3    S4    S5    S6
    (J1)  (J2)  (J3)  (J4)  (J5)  (J6)

  External Servo Supply (separate from ESP32's own rail)
                │
      ├── S1 V+  ├── S2 V+  ├── S3 V+
      ├── S4 V+  ├── S5 V+  └── S6 V+

  Common ground: ESP32 GND ── Servo Supply (-) ── all Servo GND
```

Two rails, one ground. That's the whole story judges are checking for — draw it so it's visually obvious which wires are "signal" vs. "power," e.g. red for +V, black for GND, green for PWM signal lines (matches the actual `diagram.json` wire colors).

---

## 4. Pin-mapping table

| ESP32 pin | Connects to | Purpose |
|---|---|---|
| `GPIO13` | Servo 1 (J1 Base) signal | PWM |
| `GPIO14` | Servo 2 (J2 Shoulder) signal | PWM |
| `GPIO27` | Servo 3 (J3 Elbow) signal | PWM |
| `GPIO26` | Servo 4 (J4 Wrist 1) signal | PWM |
| `GPIO25` | Servo 5 (J5 Wrist 2) signal | PWM |
| `GPIO33` | Servo 6 (J6 Wrist 3) signal | PWM |
| `GND` | Common ground bus | Ties to servo-supply `-` |
| `5V` / `USB` | ESP32's own logic supply in | **Not** shared with the servo rail |

| Each servo | Connects to |
|---|---|
| Signal (green wire) | Its ESP32 GPIO above |
| `V+` (red wire) | External Servo Supply `+` |
| `GND` (black wire) | Common ground bus (shared with ESP32 `GND`, not the ESP32's own supply pin) |

(GPIOs `13, 14, 27, 26, 25, 33` are deliberately chosen to avoid ESP32's boot-strapping pins `0/2/12/15` and the input-only `34–39` pins.)

---

## 5. Building it in Wokwi — already done, here's how to open it

`hardware/wokwi/diagram.json` and `hardware/wokwi/sketch.ino` in this repo are a ready-to-run project matching everything above: ESP32 DevKit v1, `WiFi.begin(...)`, 6 servos on GPIOs `13, 14, 27, 26, 25, 33`, each servo's `V+`/`GND` wired to a separate `servo_supply` battery part (not the ESP32's own rail), with that supply's `-` tied to the ESP32's `GND` for a common ground.

See `hardware/wokwi/README.md` for the exact steps (short version: new ESP32 project on wokwi.com, paste in `sketch.ino`, `diagram.json`, and `libraries.txt`, hit Play). Once it's running:

1. Drag parts around in the Wokwi canvas to clean up the layout for a screenshot (functionally nothing changes, Wokwi re-routes wires automatically).
2. Add a text label near the `servo_supply` part clarifying it's a stand-in for a 5-6V high-current supply (its actual simulated voltage isn't load-bearing — Wokwi doesn't model brownout).
3. Use Wokwi's export (PNG/SVG) or a screenshot for your submission.

If you'd rather present the PCA9685 version instead of direct-GPIO (better talking point re: PWM jitter under Wi-Fi load, per §2), keep this working project as your tested fallback and describe the PCA9685 upgrade path verbally — safer than risking a custom-chip that might not load correctly during a live demo.

---

## 6. Rubric-matching checklist before you screenshot/export

- [ ] **Power delivery**: two visibly separate supplies (ESP32 logic vs. servo rail) — now true in the diagram itself, not just a verbal claim.
- [ ] **Common ground**: one clear wire/net tying both rails' grounds together, visually distinct from power/signal wires.
- [ ] **Microcontroller/driver stage**: ESP32 clearly labeled as generating PWM directly (its LEDC hardware peripheral) — or upgraded to a PCA9685 if you add one, explicitly labeled as a deliberate choice either way.
- [ ] **Wi-Fi link**: something on the diagram (ESP32 antenna icon + a text label/cloud) shows the wireless control path.
- [ ] **6 servos labeled by joint** (Base, Shoulder, Elbow, Wrist 1/2/3, or `J1`–`J6`) — not generic "Servo 1..6."
- [ ] Connections logically consistent: no servo power routed through the MCU's own regulator, no floating grounds.

---

## 7. What to say to judges (2-3 sentences, have this ready)

> "For Phase 5, we designed a proof-of-concept electrical architecture where the ESP32 receives control commands over Wi-Fi. It does not power the motors directly — instead it sends PWM control signals to six actuators, one per degree of freedom, using its own hardware PWM peripheral as the driver stage. The servos draw power from a separate external supply, while the ESP32 and that supply share only a common ground reference. This mirrors how a real industrial arm separates low-power control electronics from high-current actuator power, just at hobby-servo scale for the PoC."

That paragraph directly answers "Overall System Architecture & Concept Explanation" for this component without you having to improvise it live.
