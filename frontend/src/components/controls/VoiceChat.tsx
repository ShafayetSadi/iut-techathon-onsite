'use client';

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

function assistantText(entry: TranscriptEntry): string {
  if (entry.status === 'pending') {
    return 'Transcribing and parsing your command…';
  }
  if (entry.status === 'error') {
    return entry.text;
  }

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

function assistantTone(entry: TranscriptEntry): string {
  if (entry.status === 'pending') return 'pending';
  if (entry.status === 'error') return 'error';
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
              <p className="voice-chat__text voice-chat__text--multiline">{assistantText(entry)}</p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
