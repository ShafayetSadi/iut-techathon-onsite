'use client';

/**
 * useSpeechCapture.ts — MediaRecorder lifecycle for push-to-talk.
 *
 * Push-to-talk rather than continuous listening: the backend's speech-to-text
 * is file-based, so continuous recognition would need voice-activity detection
 * and chunking. Holding a button to speak one short command is simpler and does
 * not stream the operator's room audio to a third party between commands.
 *
 * See docs/phase3-frontend-brief.md §3.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** Ordered by preference; the first supported one wins. */
const CANDIDATE_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];

/**
 * Flush a chunk every 100 ms. Without a timeslice, a fast release produces a
 * single blob holding a container header and no audio cluster — non-empty, so it
 * uploads, and the provider rejects it as a corrupted file.
 */
const TIMESLICE_MS = 100;

/** The provider's floor is 100 ms of audio. Leave room for the release gesture. */
const MIN_HOLD_MS = 350;

/**
 * A header-only clip runs a few hundred bytes. A real 350 ms Opus clip runs
 * several thousand. Anything between is a recording that never captured sound.
 */
const MIN_CLIP_BYTES = 1024;

const TOO_SHORT = 'Hold the button while you speak.';

/** ElevenLabs infers the container from the filename, so it must match the blob. */
function extensionFor(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'bin';
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return CANDIDATE_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

export interface SpeechCapture {
  start: () => Promise<void>;
  stop: () => void;
  recording: boolean;
  /** Null until the user first tries to record and the browser refuses. */
  error: string | null;
}

export function useSpeechCapture(onClip: (clip: Blob, filename: string) => void): SpeechCapture {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  /**
   * Whether the button is still held. `recording` cannot answer that: it is set
   * after `await getUserMedia` resolves, so a release during the permission
   * prompt would find it false, skip `stop()`, and leave the microphone live.
   */
  const wantsRecordingRef = useRef(false);
  const onClipRef = useRef(onClip);
  onClipRef.current = onClip;

  const teardown = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(
    () => () => {
      wantsRecordingRef.current = false;
      teardown();
    },
    [teardown],
  );

  const start = useCallback(async () => {
    if (recorderRef.current) return;
    wantsRecordingRef.current = true;
    setError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      // getUserMedia needs a secure context: localhost qualifies, a bare LAN IP does not.
      wantsRecordingRef.current = false;
      setError('Microphone unavailable. Use https:// or http://localhost.');
      return;
    }

    let stream: MediaStream;
    try {
      // `audio: true` opts out of all three of these, which is how a held button
      // in a busy room ends up transcribing the room rather than the operator.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      wantsRecordingRef.current = false;
      setError((err as Error).message || 'Microphone permission denied.');
      return;
    }

    // The button was released while the permission prompt was up.
    if (!wantsRecordingRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || 'audio/webm';
      const clip = new Blob(chunksRef.current, { type });
      const heldMs = Date.now() - startedAtRef.current;
      chunksRef.current = [];
      teardown();
      setRecording(false);

      // Reject here rather than let the provider do it: a too-short clip costs a
      // round trip and comes back as `audio_too_short` or `File is corrupted`,
      // neither of which tells the operator to hold the button longer.
      if (heldMs < MIN_HOLD_MS || clip.size < MIN_CLIP_BYTES) {
        setError(TOO_SHORT);
        return;
      }
      onClipRef.current(clip, `clip.${extensionFor(type)}`);
    };

    streamRef.current = stream;
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    recorder.start(TIMESLICE_MS);
    setRecording(true);
  }, [teardown]);

  const stop = useCallback(() => {
    wantsRecordingRef.current = false;
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop(); // fires onstop, which tears the stream down
  }, []);

  return { start, stop, recording, error };
}
