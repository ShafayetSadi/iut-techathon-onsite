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

import { useCallback } from 'react';
import { useMotionStore } from '@/lib/motion/store';
import { executeVoiceCommand } from '@/lib/voice/execute';
import { useSpeechCapture } from '@/lib/voice/useSpeechCapture';
import { useVoiceStore } from '@/lib/voice/voiceStore';
import { transcribeClip } from '@/lib/voice/voiceApi';

const EXAMPLES = ['move up', 'move forward 5 cm', 'set shoulder to 30 degrees', 'press key 3', 'home'];

export default function VoiceControls() {
  const beginTranscript = useVoiceStore((s) => s.beginTranscript);
  const resolveTranscript = useVoiceStore((s) => s.resolveTranscript);
  const attachResult = useVoiceStore((s) => s.attachResult);
  const failTranscript = useVoiceStore((s) => s.failTranscript);
  const setRecording = useVoiceStore((s) => s.setRecording);

  const handleClip = useCallback(
    async (clip: Blob, filename: string) => {
      const id = beginTranscript();
      try {
        const { transcript } = await transcribeClip(clip, filename);
        if (!transcript) {
          failTranscript(id, 'Nothing was heard.');
          return;
        }
        const resolution = resolveTranscript(id, transcript);
        const outcome = await executeVoiceCommand(resolution);
        attachResult(id, outcome);
      } catch (err) {
        failTranscript(id, (err as Error).message);
      } finally {
        const motion = useMotionStore.getState();
        motion.setMode(motion.continuousJogActive ? 'jog' : 'idle');
      }
    },
    [beginTranscript, resolveTranscript, attachResult, failTranscript],
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
