'use client';

/**
 * VoiceChat.tsx — the operator-facing conversation. See docs/problem_statement.md §5 (Phase 3B).
 *
 * Display-only: it mirrors `voiceStore.entries` and never captures audio or
 * dispatches motion. Two kinds of entry land here — deterministic matches from
 * the grammar, and agent plans from the reasoning layer — and they must be read
 * in that second order first. See `AssistantMessage`.
 */

import { useEffect, useRef } from 'react';
import { useMounted } from '@/lib/hooks/useMounted';
import { describeCommand } from '@/lib/voice/matcher';
import { useVoiceStore, type TranscriptEntry } from '@/lib/voice/voiceStore';

function ts(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour12: false });
}

function userText(entry: TranscriptEntry): string {
  if (entry.status === 'pending') return '…';
  if (entry.status === 'error') return '(voice input failed)';
  return entry.text;
}

/** The deterministic grammar path: a flat report, one fact per line. */
function matcherText(entry: TranscriptEntry): string {
  const resolution = entry.resolution;
  if (!resolution) return 'No response produced.';

  if (resolution.status === 'ambiguous') {
    const options =
      resolution.alternatives?.map((alt) => `${alt.template} (${Math.round(alt.confidence * 100)}%)`).join(', ') ??
      'unknown';
    return `I'm not sure what you meant. Possible matches: ${options}.`;
  }

  if (resolution.status === 'unmatched') {
    return resolution.reason ?? "I couldn't match that to a supported command.";
  }

  const lines: string[] = [];
  if (resolution.command) {
    lines.push(`Parsed: ${describeCommand(resolution.command)}`);
  }
  if (resolution.template) {
    lines.push(`Template: ${resolution.template}`);
  }
  if (resolution.gate) {
    lines.push(
      resolution.gate.ok
        ? 'Safety check: passed'
        : `Safety check: blocked — ${resolution.gate.reason ?? 'rejected'}`,
    );
  }
  if (entry.skipped) {
    lines.push(`Not executed: ${entry.skipped}`);
  } else if (entry.result) {
    lines.push(
      entry.result.ok
        ? 'Status: executed successfully'
        : `Status: rejected — ${entry.result.reason ?? entry.result.error ?? 'failed'}`,
    );
  } else if (resolution.gate?.ok) {
    lines.push('Status: ready to execute');
  }

  return lines.join('\n');
}

function AssistantMessage({ entry }: { entry: TranscriptEntry }) {
  if (entry.status === 'pending') {
    return <p className="voice-chat__text">Transcribing and parsing your command…</p>;
  }
  if (entry.status === 'error') {
    return <p className="voice-chat__text">{entry.text}</p>;
  }
  if (entry.agentPending) {
    return <p className="voice-chat__text">Interpreting with the agent…</p>;
  }

  // An agent entry always carries an `unmatched` or `ambiguous` resolution —
  // that is exactly what routed it to the agent (see execute.ts). So it must be
  // read before the matcher branch, or a plan that compiled, passed the backend
  // safety preflight and executed still reports "I couldn't match that".
  const agent = entry.agentResult;
  if (agent) {
    return (
      <>
        <p className="voice-chat__text">{agent.confirmation}</p>

        {agent.steps.length > 0 && (
          <ol className="voice-chat__steps">
            {agent.steps.map((step) => (
              <li key={step.id}>
                <span>{step.intent}</span>
                <small>
                  {entry.result?.ok ? 'completed' : step.status} · {step.analysis}
                </small>
              </li>
            ))}
          </ol>
        )}

        {agent.clarifyingQuestion && (
          <p className="voice-chat__text">asking · {agent.clarifyingQuestion}</p>
        )}
        {agent.failureReason && (
          <p className="voice-chat__text voice-chat__text--multiline">rejected · {agent.failureReason}</p>
        )}
        {entry.result && (
          <p className="voice-chat__text">
            {entry.result.ok
              ? 'Status: operation completed successfully'
              : `Status: failed · ${entry.result.reason ?? entry.result.error}`}
          </p>
        )}
        {entry.skipped && <p className="voice-chat__text">skipped · {entry.skipped}</p>}
      </>
    );
  }

  return <p className="voice-chat__text voice-chat__text--multiline">{matcherText(entry)}</p>;
}

function assistantTone(entry: TranscriptEntry): string {
  if (entry.status === 'pending') return 'pending';
  if (entry.status === 'error') return 'error';
  if (entry.agentPending) return 'pending';

  const agent = entry.agentResult;
  if (agent) {
    if (agent.status === 'needs_clarification') return 'ambiguous';
    if (agent.status === 'rejected') return 'error';
    if (entry.skipped) return 'blocked';
    if (entry.result) return entry.result.ok ? 'ok' : 'error';
    return 'neutral';
  }

  if (entry.skipped || entry.resolution?.gate?.ok === false) return 'blocked';
  if (entry.result && !entry.result.ok) return 'error';
  if (entry.resolution?.status === 'ambiguous') return 'ambiguous';
  if (entry.resolution?.status === 'unmatched') return 'error';
  if (entry.result?.ok) return 'ok';
  return 'neutral';
}

export default function VoiceChat() {
  const entries = useVoiceStore((s) => s.entries);
  const clearTranscripts = useVoiceStore((s) => s.clearTranscripts);
  const mounted = useMounted();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [entries]);

  return (
    <div className="voice-chat">
      <div className="voice-chat__head">
        <span className="readout__title">Conversation</span>
        <button className="btn btn--ghost btn--sm" type="button" onClick={clearTranscripts}>
          Clear
        </button>
      </div>
      <div className="voice-chat__messages" role="log" aria-live="polite" aria-relevant="additions">
        {entries.length === 0 && (
          <div className="voice-chat__empty">
            Your voice commands and assistant replies will appear here.
          </div>
        )}
        {entries.map((entry) => (
          <div className="voice-chat__turn" key={entry.id}>
            <div className="voice-chat__bubble voice-chat__bubble--user">
              <div className="voice-chat__meta">
                <span className="voice-chat__role">You</span>
                <span className="voice-chat__time">{mounted ? ts(entry.t) : ''}</span>
              </div>
              <p className="voice-chat__text">{userText(entry)}</p>
            </div>
            <div className={`voice-chat__bubble voice-chat__bubble--assistant voice-chat__bubble--${assistantTone(entry)}`}>
              <div className="voice-chat__meta">
                <span className="voice-chat__role">Assistant</span>
              </div>
              <AssistantMessage entry={entry} />
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
