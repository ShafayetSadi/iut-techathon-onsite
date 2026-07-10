'use client';

/**
 * TranscriptLog.tsx — what was heard, and what it resolved to.
 *
 * Mirrors EventLog: same scroll-to-bottom, same useMounted timestamp gate
 * (wall-clock strings differ between server and client and would otherwise
 * cause a hydration mismatch).
 */

import { useEffect, useRef } from 'react';
import { useMounted } from '@/lib/hooks/useMounted';
import { describeCommand } from '@/lib/voice/matcher';
import { useVoiceStore, type TranscriptEntry } from '@/lib/voice/voiceStore';

function ts(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour12: false });
}

function pct(confidence: number | undefined): string {
  return confidence == null ? '' : ` ${(confidence * 100).toFixed(0)}%`;
}

/** The row modifier drives the colour: pending dim, matched green, ambiguous yellow, unmatched red. */
function toneOf(entry: TranscriptEntry): string {
  if (entry.status === 'pending') return 'pending';
  if (entry.status === 'error') return 'unmatched';
  return entry.resolution?.status ?? 'unmatched';
}

function Detail({ entry }: { entry: TranscriptEntry }) {
  if (entry.status !== 'final' || !entry.resolution) return null;
  const { status, command, template, confidence, alternatives, reason, gate } = entry.resolution;

  if (status === 'matched' && command) {
    return (
      <div className="transcript__detail">
        <span className="transcript__cmd">{describeCommand(command)}</span>
        <span className="transcript__meta">
          {template}
          {pct(confidence)}
        </span>
        <span className={`transcript__gate transcript__gate--${gate?.ok ? 'ok' : 'blocked'}`}>
          {gate?.ok ? 'gate ok' : `gate blocked · ${gate?.reason}`}
        </span>
        {entry.result && (
          <span className={`transcript__gate transcript__gate--${entry.result.ok ? 'ok' : 'blocked'}`}>
            {entry.result.ok ? 'executed' : `rejected · ${entry.result.reason ?? entry.result.error}`}
          </span>
        )}
        {entry.skipped && (
          <span className="transcript__gate transcript__gate--blocked">
            skipped · {entry.skipped}
          </span>
        )}
      </div>
    );
  }

  if (status === 'ambiguous') {
    return (
      <div className="transcript__detail">
        <span className="transcript__cmd">ambiguous — not guessing</span>
        <span className="transcript__meta">
          {alternatives?.map((a) => `${a.template}${pct(a.confidence)}`).join('  ·  ')}
        </span>
      </div>
    );
  }

  return (
    <div className="transcript__detail">
      <span className="transcript__cmd">no match</span>
      <span className="transcript__meta">{reason}</span>
    </div>
  );
}

export default function TranscriptLog() {
  const entries = useVoiceStore((s) => s.entries);
  const clearTranscripts = useVoiceStore((s) => s.clearTranscripts);
  const mounted = useMounted();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [entries]);

  return (
    <div className="eventlog transcript">
      <div className="eventlog__head">
        <span className="readout__title">Voice transcript</span>
        <button className="btn btn--ghost btn--sm" onClick={clearTranscripts}>
          clear
        </button>
      </div>
      <div className="eventlog__body">
        {entries.length === 0 && (
          <div className="transcript__empty">Hold “Hold to speak” and say a command.</div>
        )}
        {entries.map((entry) => (
          <div className={`transcript__row transcript__row--${toneOf(entry)}`} key={entry.id}>
            <div className="transcript__said">
              <span className="eventlog__t">{mounted ? ts(entry.t) : ''}</span>
              <span className="transcript__text">{entry.text}</span>
            </div>
            <Detail entry={entry} />
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
