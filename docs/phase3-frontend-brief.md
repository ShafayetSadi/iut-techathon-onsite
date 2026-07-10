# Phase 3 — Talk to the Arm (frontend brief)

Slice 1: **capture and resolve.** Hold a button, speak, see the transcript and the
`MotionCommand` it resolved to, with a confidence score and the safety gate's verdict.

**The arm does not move.** `dispatch()` is never called. This is deliberate — it lets the matcher be
watched against real speech, with real speech-to-text errors, before it is trusted with motion. See
§5 for what turning execution on costs.

---

## §1 Frame convention

Voice is **robot-centric**, following ROS REP-103:

| Word | Axis | Rationale |
|---|---|---|
| up / down | ±z | Speech "up" is vertical, never "north on a map". |
| forward / back | ±x | The test panel sits at x ≈ 0.5–0.6. "Forward" must approach it. |
| left / right | ±y | Forced by the two rows above. |

### ⚠️ This disagrees with `KeyboardJog.tsx`

`AXIS_KEYS` maps `ArrowUp → +y` and `ArrowRight → +x` — a top-down map metaphor. So today, jogging
with `ArrowUp` and saying "move up" move the tip along *different axes*.

Screen-relative would have justified the keyboard's choice, but it isn't available: the camera sits at
`(1.7, -1.7, 1.35)` looking at the origin, so world `+x` and `+y` **both** project rightward. There is
no "screen left" axis.

**Recommendation:** change `AXIS_KEYS` to `ArrowUp → +x`, `ArrowLeft → +y`. Five lines, and much
cheaper now than after both are demoed. An operator who arrow-keys the arm and then says "move left"
will notice, and so will a judge.

## §2 The matcher

Pipeline: `normalize → skeletonize → score → decide`. Lives in `lib/voice/`, not the backend, because
`MotionCommand`, `validateCommand`, and `JOINTS` are already defined in TypeScript — one canonical
definition, no Pydantic mirror to drift.

**Numbers come out before scoring.** `"rotate base 30 degrees"` and `"rotate base 45 degrees"` are 92%
similar *as raw strings*, so a flat 90% threshold would match one to the other's template and silently
discard the argument. Both skeletonize to `rotate base {n} degrees`; the number becomes data.

**Three outcomes, and the third is the point:**

- `confidence < 0.90` → **unmatched**
- `best - runnerUp < 0.05` → **ambiguous**, both candidates reported, nothing chosen
- otherwise → **matched**

The ambiguity margin is why Phase 3B can ask a clarifying question instead of guessing: the rule lives
under the reasoning layer, not beside it. Verified: no two templates in the real grammar fall inside
the margin (`matcher.test.ts › template separation`).

### Known limit: short commands have no error budget

A normalized edit-distance threshold buys roughly `floor(length / 10)` typos.

| Skeleton | Length | Typos tolerated at 0.90 |
|---|---|---|
| `home`, `stop` | 4 | 0 |
| `move up` | 7 | 0 |
| `press key {n}` | 13 | 1 |
| `rotate shoulder {n} degrees` | 27 | 2 |

So `"rotat shoulder 30 degrees"` resolves (0.963) but `"move op"` does not (0.857). This fails in the
safe direction — an unmatched command asks the operator to repeat, a mis-matched one moves the arm —
and it is exactly why **`stop` is scored separately at 0.60, before any template is considered.** A
stop lost to a threshold is the only failure here with real consequences.

If short-command misses become a demo problem, lower `MATCH_THRESHOLD` to ~0.85 rather than reaching
for a cleverer distance metric; Jaro-Winkler's prefix bonus would pull `move up` and `move down`
dangerously close together.

### Sign convention

Never assume "up" or "left" means a positive joint delta. Rotation about `+z` carries `+x` toward
`+y`, so for a **yaw** joint "left" is positive. Rotation about `+y` carries `+z` toward `+x`, tipping
the arm forward and down, so for a **pitch** joint "down" is positive and "up" is negative.
`JOINT_VOCAB` derives this per joint from `JOINTS[i].axis`.

### Vocabulary

Joint names come from the labels already in `robot.config.ts`: `base`, `shoulder`, `elbow`, `forearm`,
`wrist`, `tool`, `stylus`. (`joint_5` and `joint_6` are both "wrist" in casual speech; the repo's own
"wrist pitch" / "tool roll" labels keep them distinct.)

```
move up|down|left|right|forward|back  [{n} [millimeters|centimeters|meters]]
rotate <joint> [left|right|up|down] {n} degrees
set <joint> to {n} degrees
center <joint>
press [key] {n}          # 1–6
home | reset
stop | halt | abort      # never fuzzy-gated
```

A bare number is centimeters after `move`, degrees after `rotate`. `"a couple"` → `2`, so the rubric's
own `"nudge the tip a couple centimeters"` reduces to `move {n} centimeters` — and correctly stays
*unmatched*, because it names no direction. That utterance is a Phase 3B case, not a grammar case.

## §3 Capture

**Push-to-talk, not continuous listening.** The backend's speech-to-text is file-based, so continuous
recognition would need voice-activity detection and chunking. Holding a button also avoids streaming
room audio to a third party between commands.

**The API key forces a backend hop.** Next.js inlines every `NEXT_PUBLIC_*` variable into the client
bundle. The browser records; FastAPI holds the key and calls ElevenLabs; the transcript comes back and
is forgotten. Nothing is stored server-side. Set `ROBOT_ELEVENLABS_API_KEY` — note the `ROBOT_` prefix
that `Settings` requires.

Two browser constraints worth knowing:

- Chrome records `audio/webm;codecs=opus`, Safari `audio/mp4`. The upload filename extension is derived
  from `recorder.mimeType` because ElevenLabs infers the container from the filename.
- `getUserMedia` needs a secure context. `localhost` qualifies; `http://192.168.x.x:3000` does not.

`VoiceControls` deliberately does **not** use `useContinuousJog` — that dispatcher exists for held-down
input and keeps a shared in-flight gate. A spoken command is a discrete one-shot.

## §4 State

`voiceStore` is separate from `motionStore`, following the rule `viewerStore` states: `motionStore`
holds authoritative arm state, everything else gets its own store. A transcript records what was said;
it is not a fact about the arm. In-memory only, capped at 100 entries, gone on reload — matching the
rest of the app, which has no persistence anywhere.

## §5 Turning execution on

One condition in `VoiceControls`:

```ts
if (resolution.status === 'matched' && resolution.gate?.ok) {
  void useMotionStore.getState().dispatch(resolution.command);
}
```

`dispatch()` already runs `validateCommand()` before any motion, so the rubric's hard requirement —
every command passes a deterministic safety check before the arm moves — holds by construction, for
voice and for the Phase 3B agent alike.

Two things to settle first:

1. **Race with the joystick.** A direct `dispatch()` bypasses the module-scope `inFlight` gate in
   `useContinuousJog`, so a voice command fired while the stick is held can interleave with a jog
   request. Either acquire the same gate or refuse voice while `continuousJogActive`.
2. **`move forward 1 meter` passes the gate.** `validateCommand` only checks `jog_cartesian` deltas for
   finiteness — the workspace bound is checked on `move_to` targets, not on jog deltas. The backend
   catches it, but slowly: an unreachable target burns every IK seed before failing. For spoken
   feedback that reads as a multi-second hang.
