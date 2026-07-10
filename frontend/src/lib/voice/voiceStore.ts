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
import { describeCommand, matchTranscript, type Resolution } from './matcher';
import type { AgentChatMessage, AgentPendingPlan, AgentResponse } from './agentApi';

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
  agentResult?: AgentResponse;
  agentPending?: boolean;
}

/** Enough history to scroll back through a demo, bounded so it cannot grow forever. */
const MAX_TRANSCRIPTS = 100;
const MAX_AGENT_CHAT_MESSAGES = 10;

let counter = 0;
function nextId(): string {
  counter += 1;
  return `t${counter}`;
}

export interface VoiceState {
  entries: TranscriptEntry[];
  /** Set by VoiceControls so other components can react to a live mic. */
  recording: boolean;
  pendingPlan: { plan: AgentPendingPlan; expiresAt: number } | null;

  /** Insert a placeholder the moment the button is released, before upload. */
  beginTranscript: () => string;
  /** Attach the recognized text and run it through the matcher. */
  resolveTranscript: (id: string, text: string) => Resolution;
  markAgentPending: (id: string) => void;
  attachResult: (id: string, outcome: { result?: MotionResult; skipped?: string; agentResult?: AgentResponse }) => void;
  buildAgentChatHistory: () => AgentChatMessage[];
  setPendingPlan: (plan: AgentPendingPlan) => void;
  getPendingPlan: () => AgentPendingPlan | undefined;
  clearPendingPlan: () => void;
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

function deterministicAssistantText(entry: TranscriptEntry): string | null {
  const resolution = entry.resolution;
  if (!resolution) return null;
  if (resolution.status !== 'matched' || !resolution.command) return null;

  const lines = [`Parsed: ${describeCommand(resolution.command)}`];
  if (entry.skipped) {
    lines.push(`Not executed: ${entry.skipped}`);
  } else if (entry.result) {
    lines.push(
      entry.result.ok
        ? 'Status: executed successfully'
        : `Status: rejected — ${entry.result.reason ?? entry.result.error ?? 'failed'}`,
    );
  }
  return lines.join('\n');
}

function agentAssistantText(entry: TranscriptEntry): string | null {
  const agent = entry.agentResult;
  if (!agent) return null;

  const lines = [agent.confirmation];
  if (agent.clarifyingQuestion) lines.push(`asking · ${agent.clarifyingQuestion}`);
  if (agent.failureReason) lines.push(`rejected · ${agent.failureReason}`);
  if (entry.result) {
    lines.push(
      entry.result.ok
        ? 'Status: operation completed successfully'
        : `Status: failed · ${entry.result.reason ?? entry.result.error}`,
    );
  }
  if (entry.skipped) lines.push(`skipped · ${entry.skipped}`);
  return lines.join('\n');
}

function messagesForEntry(entry: TranscriptEntry): AgentChatMessage[] {
  if (entry.status !== 'final') return [];

  const messages: AgentChatMessage[] = [];
  const userText = entry.text.trim();
  if (userText) messages.push({ role: 'user', content: userText, t: entry.t });

  const assistantText = agentAssistantText(entry) ?? deterministicAssistantText(entry);
  if (assistantText) messages.push({ role: 'assistant', content: assistantText, t: entry.t });
  return messages;
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  entries: [],
  recording: false,
  pendingPlan: null,

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

  markAgentPending: (id) => {
    set({ entries: replace(get().entries, id, { agentPending: true }) });
  },

  attachResult: (id, outcome) => {
    set({ entries: replace(get().entries, id, { ...outcome, agentPending: false }) });
  },

  buildAgentChatHistory: () => (
    get().entries.flatMap(messagesForEntry).slice(-MAX_AGENT_CHAT_MESSAGES)
  ),

  setPendingPlan: (plan) => set({ pendingPlan: { plan, expiresAt: Date.now() + 120_000 } }),
  getPendingPlan: () => {
    const pending = get().pendingPlan;
    if (!pending) return undefined;
    if (pending.expiresAt <= Date.now()) {
      set({ pendingPlan: null });
      return undefined;
    }
    return pending.plan;
  },
  clearPendingPlan: () => set({ pendingPlan: null }),

  failTranscript: (id, reason) => {
    set({ entries: replace(get().entries, id, { status: 'error', text: reason }) });
  },

  clearTranscripts: () => set({ entries: [] }),
  setRecording: (recording) => set({ recording }),
}));

/** Re-exported so UI code has one import for the whole voice surface. */
export type { MotionCommand, Resolution };
