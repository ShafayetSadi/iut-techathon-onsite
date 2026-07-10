'use client';

/**
 * VoiceControls.tsx — push-to-talk capture. See docs/phase3-frontend-brief.md §3.
 *
 * Matched commands execute through motionStore.dispatch after the matcher and
 * deterministic safety gate accept them.
 *
 * Deliberately does not go through `useContinuousJog`: that dispatcher exists
 * for held-down input and keeps a shared in-flight gate. A spoken command is a
 * discrete one-shot.
 */

import { useCallback, useState, type FormEvent } from 'react';
import { useMotionStore } from '@/lib/motion/store';
import { executeVoiceCommand } from '@/lib/voice/execute';
import { useSpeechCapture } from '@/lib/voice/useSpeechCapture';
import { useVoiceStore } from '@/lib/voice/voiceStore';
import { transcribeClip } from '@/lib/voice/voiceApi';
import { describeOutcome, speak } from '@/lib/voice/speak';

const EXAMPLES = [
  'move up',
  'move forward 5 cm',
  'set shoulder to 30 degrees',
  'press key 3',
  'home',
  'nudge the tip toward the panel and tap 5 twice',
];

export default function VoiceControls() {
  const [typedCommand, setTypedCommand] = useState('');
  const beginTranscript = useVoiceStore((s) => s.beginTranscript);
  const resolveTranscript = useVoiceStore((s) => s.resolveTranscript);
  const markAgentPending = useVoiceStore((s) => s.markAgentPending);
  const attachResult = useVoiceStore((s) => s.attachResult);
  const failTranscript = useVoiceStore((s) => s.failTranscript);
  const setRecording = useVoiceStore((s) => s.setRecording);

  const runTranscript = useCallback(
    async (id: string, transcript: string) => {
      const voice = useVoiceStore.getState();
      const pendingPlan = voice.getPendingPlan();
      const resolution = resolveTranscript(id, transcript);
      if (pendingPlan || resolution.status === 'unmatched' || resolution.status === 'ambiguous') {
        markAgentPending(id);
      }
      const outcome = await executeVoiceCommand(resolution, { transcript, pendingPlan });
      attachResult(id, outcome);

      // The browser boundary lives here, not in `execute.ts` — that module is a
      // pure dispatcher tested under node, with no `window` to stub.
      const spoken = describeOutcome(outcome);
      if (spoken) speak(spoken);

      if (outcome.agentResult?.status === 'needs_clarification' && outcome.agentResult.pendingPlan) {
        voice.setPendingPlan(outcome.agentResult.pendingPlan);
      } else if (outcome.clearPending) {
        voice.clearPendingPlan();
      }
    },
    [attachResult, markAgentPending, resolveTranscript],
  );

  const handleClip = useCallback(
    async (clip: Blob, filename: string) => {
      const id = beginTranscript();
      try {
        const { transcript } = await transcribeClip(clip, filename);
        if (!transcript) {
          failTranscript(id, 'Nothing was heard.');
          return;
        }
        await runTranscript(id, transcript);
      } catch (err) {
        failTranscript(id, (err as Error).message);
      } finally {
        const motion = useMotionStore.getState();
        motion.setMode(motion.continuousJogActive ? 'jog' : 'idle');
      }
    },
    [beginTranscript, failTranscript, runTranscript],
  );

  const { start, stop, recording, error } = useSpeechCapture(handleClip);

  const press = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      // The label grows to "Listening… release to send" the moment recording
      // starts, and the reflow can slide the button out from under a stationary
      // cursor — firing pointerleave and cutting the clip short. Capture pins
      // every subsequent pointer event to this button instead.
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setRecording(true);
      useMotionStore.getState().setMode('voice');
      void start();
    },
    [setRecording, start],
  );

  // Idempotent, and deliberately does not read `recording`: that state is set
  // after `getUserMedia` resolves, so a release during the permission prompt
  // would see `false` and never stop the recorder. `useSpeechCapture` owns the
  // real answer in a ref.
  const release = useCallback(() => {
    stop();
    setRecording(false);
  }, [stop, setRecording]);

  const submitTyped = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const transcript = typedCommand.trim();
      if (!transcript) return;
      setTypedCommand('');
      const id = beginTranscript();
      useMotionStore.getState().setMode('voice');
      try {
        await runTranscript(id, transcript);
      } catch (err) {
        failTranscript(id, (err as Error).message);
      } finally {
        const motion = useMotionStore.getState();
        motion.setMode(motion.continuousJogActive ? 'jog' : 'idle');
      }
    },
    [beginTranscript, failTranscript, runTranscript, typedCommand],
  );

  return (
    <div className="voice">
      <button
        className={`btn btn--primary voice__ptt ${recording ? 'voice__ptt--live' : ''}`}
        type="button"
        onPointerDown={press}
        onPointerUp={release}
        onPointerCancel={release}
      >
        {recording ? 'Listening… release to send' : 'Hold to speak'}
      </button>

      {recording && <span className="pill pill--warn">recording</span>}
      {error && <p className="voice__error">{error}</p>}

      <form className="voice__typed" onSubmit={submitTyped}>
        <input
          aria-label="Typed robot instruction"
          className="voice__input"
          value={typedCommand}
          onChange={(event) => setTypedCommand(event.target.value)}
          placeholder="Type an instruction"
        />
        <button className="btn btn--sm" type="submit" disabled={!typedCommand.trim()}>
          Send
        </button>
      </form>

      <p className="voice__hint">
        Matched commands run through the same safety gate and motion pipeline.
      </p>
      <ul className="voice__examples">
        {EXAMPLES.map((example) => (
          <li key={example}>&ldquo;{example}&rdquo;</li>
        ))}
      </ul>
    </div>
  );
}
