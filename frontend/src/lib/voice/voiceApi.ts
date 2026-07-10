import { BACKEND_URL } from '@/lib/motion/backendApi';

export interface TranscriptionResponse {
  transcript: string;
  languageCode?: string;
}

/**
 * Upload a recorded clip for transcription.
 *
 * The ElevenLabs key lives on the backend, never here: Next.js inlines every
 * NEXT_PUBLIC_* variable into the client bundle, so a key referenced from
 * browser code would ship to every visitor.
 */
export async function transcribeClip(clip: Blob, filename: string): Promise<TranscriptionResponse> {
  const form = new FormData();
  // No explicit Content-Type — the browser must set the multipart boundary.
  form.append('audio', clip, filename);

  const res = await fetch(`${BACKEND_URL}/api/voice/transcribe`, { method: 'POST', body: form });
  const payload = (await res.json().catch(() => null)) as
    | (TranscriptionResponse & { reason?: string; detail?: string })
    | null;

  if (!res.ok) {
    throw new Error(payload?.reason || payload?.detail || `Transcription failed (${res.status})`);
  }
  return payload as TranscriptionResponse;
}
