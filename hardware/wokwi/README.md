# Phase 5 — Wokwi PoC circuit

`diagram.json` + `sketch.ino` here are a ready-to-run Wokwi project: ESP32 DevKit v1, Wi-Fi connect, and 6 servos (J1 Base … J6 Wrist 3) driven directly off ESP32 GPIOs, powered from a separate `servo_supply` battery part (not the ESP32's own rail) with a shared common ground. See `docs/phase5-electrical-schematic-brief.md` for the full architecture/rationale — this folder is the "already built" version of that doc's §4-5.

## Run it (no local install needed)

1. Go to [wokwi.com](https://wokwi.com) → **New Project → ESP32**.
2. In the file tabs on the left, open `sketch.ino` and replace its contents with this folder's `sketch.ino`.
3. Click the `diagram.json` tab (or **"+"** → add file → name it `diagram.json` if it's not there yet) and replace its contents with this folder's `diagram.json`.
4. **"+"** → add file → name it `libraries.txt` and paste in this folder's `libraries.txt` (just the line `ESP32Servo`) — without this, the build fails with `ESP32Servo.h: No such file or directory` because Wokwi doesn't auto-resolve that library from the `#include` alone.
5. Click the green ▶ **Play** button. You should see the ESP32 connect to `Wokwi-GUEST` Wi-Fi in the serial monitor, then all 6 servos sweep together.
5. Rearrange parts by dragging (Wokwi auto-routes wires) if you want a cleaner screenshot for your submission, then use Wokwi's **Export → Download as PNG/SVG** (or just screenshot) for your deliverable.

## Run it locally in VS Code (bypasses Wokwi's cloud build queue)

This folder now also has a PlatformIO project (`platformio.ini`, `wokwi.toml`, `src/main.cpp`) so the Wokwi VS Code extension can simulate using a firmware compiled on **your own machine**, instead of Wokwi's shared free-tier build servers.

One-time setup:

1. Install the **PlatformIO IDE** extension in VS Code (separate from the Wokwi extension you already installed — PlatformIO is the actual compiler/toolchain; Wokwi's extension only runs the simulation).
2. Get a free Wokwi license: open the Command Palette (`Ctrl+Shift+P`) → **"Wokwi: Request a New License"** (or click the Wokwi icon in the sidebar and follow the "get a license" prompt) → it opens a browser tab to confirm, then saves the key locally. This is a one-time step.
3. Open this `hardware/wokwi/` folder in VS Code (PlatformIO auto-detects `platformio.ini` and will prompt to install the `espressif32` platform + `ESP32Servo` library the first time — let it finish, it only downloads once).

Every time after that:

1. Build with PlatformIO first (PlatformIO sidebar icon → **Build**, or `Ctrl+Alt+B`). This produces `.pio/build/esp32dev/firmware.bin` / `.elf`, which is what `wokwi.toml` points at.
2. Open `diagram.json` in the editor, then Command Palette → **"Wokwi: Start Simulator"** (or the ▶ icon that appears in the top-right of `diagram.json` once `wokwi.toml` is detected).
3. The simulator panel opens right inside VS Code — same servo sweep behavior as the web version, just compiled locally so there's no queue to wait on.

If you edit `src/main.cpp`, rebuild with PlatformIO before restarting the simulator — the extension only re-reads the `.bin`/`.elf` files, it doesn't recompile for you.

## Notes

- Servo `V+`/`GND` are wired to a separate `servo_supply` part (a `wokwi-9v-battery`, used only as a labeled stand-in for a real 5-6V high-current supply — Wokwi has no generic variable-voltage supply part and doesn't simulate the exact voltage or brownout behavior), **not** the ESP32's own rail. Only the grounds are tied together (`servo_supply:-` → `esp:GND.1`). This is the actual power-delivery architecture graders are checking for, not just a verbal claim.
- This uses direct-GPIO servo drive (no PCA9685) because PCA9685 isn't a native Wokwi part — only available as a fragile community custom-chip. If you'd rather present the PCA9685 architecture, keep this working diagram as your fallback/tested version and describe the PCA9685 upgrade path verbally to judges (see brief §2).
