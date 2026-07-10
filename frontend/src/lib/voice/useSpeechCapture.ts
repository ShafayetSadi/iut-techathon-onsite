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
  const onClipRef = useRef(onClip);
  onClipRef.current = onClip;

  const teardown = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  const start = useCallback(async () => {
    if (recorderRef.current) return;
    setError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      // getUserMedia needs a secure context: localhost qualifies, a bare LAN IP does not.
      setError('Microphone unavailable. Use https:// or http://localhost.');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setError((err as Error).message || 'Microphone permission denied.');
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
      chunksRef.current = [];
      teardown();
      setRecording(false);
      if (clip.size > 0) onClipRef.current(clip, `clip.${extensionFor(type)}`);
    };

    streamRef.current = stream;
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  }, [teardown]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop(); // fires onstop, which tears the stream down
  }, []);

  return { start, stop, recording, error };
}
