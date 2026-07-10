# Phase 2 — Move the Arm: Joystick + Keyboard Jog

**Owner:** Frontend / Controls
**Consumed by:** Claude Code in the IDE
**Goal of this doc:** close out Phase 2 without duplicating what's already built, and without breaking the "one motion pipeline, five triggers" rule from Phase 1.

---

## 1. What's already done (verified in code, not assumed)

Don't rebuild these — they exist and work:

| Piece | File | Status |
|---|---|---|
| IK solver (damped least-squares, multi-seed) | `backend/app/robot/ik_solver.py` | ✅ Done |
| `/api/ik/solve`, `/api/motion/jog` endpoints | `backend/app/api/routes_ik.py`, `routes_motion.py` | ✅ Done |
| Safety/workspace validation | `backend/app/motion/safety.py`, frontend `lib/motion/validate.ts` | ✅ Done |
| `MotionCommand` → `dispatch()` → backend → store pipeline | `lib/motion/commands.ts`, `store.ts`, `backendApi.ts` | ✅ Done |
| Discrete-step Cartesian jog (button grid) | `components/viewer/CartesianControls.tsx` | ✅ Done (this *is* a crude joystick — step buttons, not analog drag) |
| Joint-space sliders (drag-to-rotate in 3D + sidebar) | `components/viewer/JointSliders.tsx`, `RobotScene.tsx` | ✅ Done |

**Remaining for Phase 2, per the rubric ("Manual Control — GUI Joystick + Keyboard"):**

1. A real **draggable, analog, on-screen joystick** for jogging the stylus tip (not discrete buttons).
2. **Keyboard jog** (arrow/WASD + modifiers) driving the *same* motion, not a parallel implementation.

Both are new files under `components/controls/` — a folder the Phase 1 brief already reserved for this work (see §5 of that doc).

---

## 2. The one thing to fix before building either control

`jogCartesian()` in `backendApi.ts` and the backend `JogRequest` **already accept a full `{x, y, z}` delta in one call** (`app/motion/planner.py::jog` adds the whole vector to the current tip, then solves once). But the frontend `MotionCommand` contract only exposes a **single-axis** jog:

```ts
// commands.ts — current, single-axis only
| { type: 'jog_cartesian'; axis: 'x' | 'y' | 'z'; delta: number; frame?: 'world' | 'tool' }
```

A joystick naturally produces **diagonal** motion (dx and dy at once). Two ways to handle that:

- ❌ **Don't** dispatch twice (once per axis) per tick — that's two sequential HTTP round-trips and two IK solves per frame of joystick movement, doubling latency and making the arm feel laggy/jerky (fails the rubric's "responsive" bar).
- ✅ **Do** widen the contract to carry a vector, matching what the backend already accepts:

```ts
// commands.ts — proposed
| { type: 'jog_cartesian'; delta: Vec3; frame?: 'world' | 'tool' }
```

This is a small, mechanical change (update the type, the `dispatch()` case in `store.ts`, and the two call sites in `CartesianControls.tsx` to pass `{ x: delta, y: 0, z: 0 }` etc.). Do this **first** — both the joystick and keyboard control depend on it, and it's the kind of shared-contract change that should land before either is built, not be retrofitted after.

---

## 3. Why continuous input needs rate-limiting (the actual risk here)

Every jog — discrete or continuous — is a full HTTP round-trip to a numerical IK solver (`/api/motion/jog`). A draggable joystick or a held-down key naturally wants to fire every animation frame (60/s). At that rate:

- You'd flood FastAPI with 60 IK solves/sec for a single jog gesture.
- Responses can arrive **out of order** (request #2 might resolve before #1 if solve time varies), which would snap the arm backward for a frame — visibly janky and a correctness bug, not just a performance one.

**Mitigation — build one shared hook, use it from both controls:**

```ts
// lib/motion/useContinuousJog.ts
// Ticks at a fixed rate (~12-15 Hz) while a "jog vector" is non-zero.
// Keeps a monotonic request sequence number; if a response arrives for a
// request that isn't the most recent one issued, its result is discarded
// (last-request-wins), so the store never rewinds to a stale position.
```

Both `Joystick.tsx` and `KeyboardJog.tsx` should report "current desired jog vector" into this one hook, not implement their own timers. This keeps the rubric's "one pipeline" principle intact — the joystick and keyboard are two *inputs* into one *rate-limited dispatcher*, same as `dispatch()` is one entry point for all five triggers.

---

## 4. Component specs

### 4.1 `components/controls/Joystick.tsx`

- Circular base + draggable knob, built on **Pointer Events** (`pointerdown/pointermove/pointerup` + `setPointerCapture`), not `mousedown` — so it works with touch/pen too and keeps tracking even if the pointer leaves the element bounds.
- Math: knob offset from center → clamp to base radius → apply a deadzone (~15% of radius, else tiny hand tremors jog the arm) → normalize remaining range to `[0, 1]` → scale to a max jog speed (e.g. `MAX_JOG_MM_S = 60`) → feed `{x, y}` (screen-plane, world frame for now — tool-frame jogging is a stretch goal, not required) into `useContinuousJog`.
- Z is **not** on this stick (a 2D stick shouldn't also carry a third axis by convention/accidental drag) — keep the existing `Z+`/`Z-` buttons or add a small vertical slider next to the joystick reusing the same `useContinuousJog` vector.
- Visual feedback: knob snaps back to center on release; a subtle ring or color shift while `status === 'moving'` communicates that the arm is actually tracking input (helps the "feels responsive" criterion — a joystick with no feedback loop reads as broken even if it works).

### 4.2 `components/controls/KeyboardJog.tsx`

- No visual output — a mounted-once listener component (add it in `page.tsx` next to the other panels, not inside the 3D canvas).
- Track held keys in a `Set<string>` via `keydown`/`keyup` on `window`; derive the jog vector from the set every tick (don't dispatch directly from the key event — that's what caused the single-axis-per-call problem in the first place).
- Suggested mapping (confirm with your team before locking it in):

| Keys | Axis |
|---|---|
| `↑` / `W` , `↓` / `S` | Y |
| `→` / `D` , `←` / `A` | X |
| `PageUp` / `E` , `PageDown` / `Q` | Z |
| `Shift` held | fine step (e.g. 0.3× speed) instead of a separate mode |

- Guard: ignore key events when `document.activeElement` is an `<input>`/`<textarea>` (the joint-slider numeric inputs are real text fields — don't hijack arrow keys away from them).

### 4.3 Shared: `lib/motion/useContinuousJog.ts`

- Single hook, one `requestAnimationFrame`-driven or `setInterval`-driven ticker (interval is simpler and easier to rate-cap deliberately; RAF ties you to display refresh rate for no benefit here).
- Input: a ref/state of the current `{x, y, z}` jog vector (magnitude 0 = idle, nothing dispatched).
- Output: dispatches `{ type: 'jog_cartesian', delta, frame: 'world' }` through the *existing* `useMotionStore().dispatch` — never calls `backendApi.ts` directly. This keeps the safety gate (`validate.ts`) and logging in the loop for every jog, exactly as it already is for the button grid.

---

## 5. Definition of Done (Phase 2 — Manual Control)

- [ ] `MotionCommand`'s `jog_cartesian` carries a `Vec3` delta (§2), and `CartesianControls.tsx` still works after the change.
- [ ] `useContinuousJog` exists, rate-limits to ~12-15 Hz, and discards stale/out-of-order responses.
- [ ] On-screen joystick drags smoothly, deadzone feels right (no jitter at rest), and the arm tracks it without visible lag or backward snapping.
- [ ] Keyboard jog drives the *same* motion (same hook), doesn't fight with text inputs, and `Shift` gives a finer step.
- [ ] Both controls respect `validateCommand` — try dragging the joystick toward a point outside `MAX_REACH_M` and confirm you get a rejection in the event log, not a silent failure or a crash.
- [ ] Nothing new holds joint/EE state outside `useMotionStore` — controls only ever call `dispatch`.

---

## 6. Ready-to-paste prompts (feed these one at a time, not as one giant ask)

**Prompt 1 — widen the jog contract:**

> In `frontend/src/lib/motion/commands.ts`, change the `jog_cartesian` variant of `MotionCommand` from `{ type: 'jog_cartesian'; axis: 'x' | 'y' | 'z'; delta: number; frame?: 'world' | 'tool' }` to `{ type: 'jog_cartesian'; delta: Vec3; frame?: 'world' | 'tool' }`. Update the `case 'jog_cartesian'` branch in `lib/motion/store.ts` to pass `cmd.delta` straight through to `jogCartesian()` instead of building a single-axis vector. Update `validate.ts`'s `jog_cartesian` case to validate all three delta components are finite. Update the two call sites in `components/viewer/CartesianControls.tsx` so each button still dispatches a single-axis delta (e.g. `{ x: JOG_STEP_M, y: 0, z: 0 }`) — behavior must stay identical, this is a contract widening, not a behavior change.

**Prompt 2 — the shared rate-limited jog hook:**

> Create `frontend/src/lib/motion/useContinuousJog.ts`. It should expose a hook that: (1) accepts a live jog-vector source (a ref updated externally), (2) on a fixed interval (~80ms) while the vector's magnitude is above a small epsilon, dispatches `useMotionStore.getState().dispatch({ type: 'jog_cartesian', delta: scaledVector, frame: 'world' })`, (3) tracks a monotonically increasing sequence number per dispatch and drops/ignores the result of any dispatch that is no longer the most recent one issued (so an old response can't rewind the arm after a newer command has already been sent), (4) cleans up its interval on unmount. No UI — this is a plain hook other components call into.

**Prompt 3 — the joystick:**

> Create `frontend/src/components/controls/Joystick.tsx`: a circular draggable on-screen joystick using Pointer Events (`pointerdown`/`pointermove`/`pointerup`, `setPointerCapture`) so it works with mouse and touch. Compute knob offset from center, clamp to the base radius, apply a ~15%-of-radius deadzone, normalize the remaining range, and feed the resulting `{x, y}` unit vector (scaled to a max jog speed constant) into the `useContinuousJog` hook from `lib/motion/useContinuousJog.ts` (z stays 0 — this stick is XY only). Style it to match the existing panel look in `globals.css`. Mount it in `page.tsx` inside the left panel, next to `CartesianControls`, not replacing it yet.

**Prompt 4 — keyboard jog:**

> Create `frontend/src/components/controls/KeyboardJog.tsx`: a non-visual component that listens for `keydown`/`keyup` on `window`, maintains a `Set` of currently-held keys, and on each tick derives an `{x, y, z}` jog vector from arrow keys/WASD (Y: ↑/W up, ↓/S down; X: →/D positive, ←/A negative; Z: E/PageUp up, Q/PageDown down), with `Shift` held scaling the vector by ~0.3 for a fine-step mode. Feed the vector into the same `useContinuousJog` hook used by the joystick. Ignore all key handling while `document.activeElement` is an `input` or `textarea`. Mount it once in `page.tsx` (renders nothing, just needs to be alive).

---

## 7. Open decisions to confirm with your team before Prompt 1 (don't guess silently)

- **Screen-plane vs. world-plane mapping for the joystick.** Right now the camera can orbit (`OrbitControls`), so "joystick right" mapped to world +X will feel wrong once the camera has rotated 90°. Simplest fix for Phase 2: map the joystick to world X/Y as-is and accept that it's most intuitive from the default camera angle (documented limitation) — true screen-relative jogging is a nice-to-have, not required by the rubric.
- **Status flicker.** `dispatch()` sets `status: 'moving'` then back to `'ready'` per call; at 12-15 Hz that's a lot of flicker for the `ModeStatus` pill. Decide whether that's fine (probably is — cosmetic) or whether continuous jog should set a distinct `mode: 'jog'` state once at gesture-start and clear it at gesture-end instead of per-tick.
