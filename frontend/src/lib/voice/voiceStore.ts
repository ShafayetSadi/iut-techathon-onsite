'use client';

/**
 * voiceStore.ts — transcripts and what they resolved to.
 *
 * Kept separate from the motion store, following the same rule viewerStore
 * states: `motionStore` holds authoritative arm state, everything else gets its
 * own store. A transcript is a record of what was said, not a fact about the arm.
 *
 * In-memory only. Nothing here survives a reload, matching the rest of the app.
 */

import { create } from 'zustand';
import type { MotionCommand, MotionResult } from '@/lib/motion/commands';
import { matchTranscript, type Resolution } from './matcher';

export type TranscriptStatus = 'pending' | 'final' | 'error';

export interface TranscriptEntry {
  id: string;
  t: number;
  status: TranscriptStatus;
  /** What the operator said, or the failure reason when `status` is 'error'. */
  text: string;
  resolution?: Resolution;
  result?: MotionResult;
  skipped?: string;
}

/** Enough history to scroll back through a demo, bounded so it cannot grow forever. */
const MAX_TRANSCRIPTS = 100;

let counter = 0;
function nextId(): string {
  counter += 1;
  return `t${counter}`;
}

export interface VoiceState {
  entries: TranscriptEntry[];
  /** Set by VoiceControls so other components can react to a live mic. */
  recording: boolean;

  /** Insert a placeholder the moment the button is released, before upload. */
  beginTranscript: () => string;
  /** Attach the recognized text and run it through the matcher. */
  resolveTranscript: (id: string, text: string) => Resolution;
  attachResult: (id: string, outcome: { result?: MotionResult; skipped?: string }) => void;
  failTranscript: (id: string, reason: string) => void;
  clearTranscripts: () => void;
  setRecording: (recording: boolean) => void;
}

function replace(
  entries: TranscriptEntry[],
  id: string,
  patch: Partial<TranscriptEntry>,
): TranscriptEntry[] {
  return entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry));
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  entries: [],
  recording: false,

  beginTranscript: () => {
    const id = nextId();
    const entry: TranscriptEntry = { id, t: Date.now(), status: 'pending', text: 'transcribing…' };
    const entries = [...get().entries, entry];
    if (entries.length > MAX_TRANSCRIPTS) entries.splice(0, entries.length - MAX_TRANSCRIPTS);
    set({ entries });
    return id;
  },

  resolveTranscript: (id, text) => {
    const resolution = matchTranscript(text);
    set({ entries: replace(get().entries, id, { status: 'final', text, resolution }) });
    return resolution;
  },

  attachResult: (id, outcome) => {
    set({ entries: replace(get().entries, id, outcome) });
  },

  failTranscript: (id, reason) => {
    set({ entries: replace(get().entries, id, { status: 'error', text: reason }) });
  },

  clearTranscripts: () => set({ entries: [] }),
  setRecording: (recording) => set({ recording }),
}));

/** Re-exported so UI code has one import for the whole voice surface. */
export type { MotionCommand, Resolution };
