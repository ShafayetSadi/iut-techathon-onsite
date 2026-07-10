"""Recognition hints for the speech-to-text model.

These bias Scribe's decoder toward words it would otherwise lose to a more
probable English phrase. "forearm" is the one that matters most: transcribed as
"four arm", the frontend's number-word expansion turns "four" into 4, and
"rotate forearm 30 degrees" reaches the matcher as "rotate {n} arm {n} degrees",
which matches nothing at all.

Deliberately short. Biasing common words ("move", "up", "base") buys nothing —
Scribe already gets those right — and every term carries a billing surcharge.

This is a *hint*, not a grammar. The grammar lives in
`frontend/src/lib/voice/grammar.ts` and stays the single source of truth. Drift
is harmless here: a stale keyterm biases toward a word the matcher no longer
accepts, and the matcher rejects it exactly as it would have anyway.

Staying under 100 terms also avoids ElevenLabs' 20-second minimum billable
duration, which would otherwise apply to every two-second clip.
"""

from __future__ import annotations

KEYTERMS: tuple[str, ...] = (
    # Joint names that collide with common phrases.
    "forearm",
    "shoulder",
    "elbow",
    "wrist",
    "stylus",
    # Axis words, rare in ordinary speech.
    "yaw",
    "pitch",
    "roll",
    # Units, frequently clipped or anglicised.
    "millimeters",
    "centimeters",
    "degrees",
    # Direction words with long, misheard forms.
    "counterclockwise",
    "clockwise",
)
