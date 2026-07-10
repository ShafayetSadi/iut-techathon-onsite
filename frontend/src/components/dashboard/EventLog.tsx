'use client';

import { useEffect, useRef } from 'react';
import { useMotionStore } from '@/lib/motion/store';
import { useMounted } from '@/lib/hooks/useMounted';

function ts(t: number): string {
  const d = new Date(t);
  return d.toLocaleTimeString([], { hour12: false });
}

export default function EventLog() {
  const log = useMotionStore((s) => s.log);
  const clearLog = useMotionStore((s) => s.clearLog);
  const status = useMotionStore((s) => s.status);
  const mounted = useMounted();
  const endRef = useRef<HTMLDivElement>(null);
  const latestError =
    status === 'error'
      ? [...log].reverse().find((entry) => entry.level === 'error')
      : null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [log]);

  return (
    <div className="eventlog">
      <div className="eventlog__head">
        <span className="readout__title">Event log</span>
        <button className="btn btn--ghost btn--sm" onClick={clearLog}>
          clear
        </button>
      </div>
      {latestError ? (
        <div className="eventlog__alert" role="status">
          {latestError.text}
        </div>
      ) : null}
      <div className="eventlog__body">
        {log.map((e, i) => (
          <div className={`eventlog__row eventlog__row--${e.level}`} key={`${e.t}-${i}`}>
            <span className="eventlog__t">{mounted ? ts(e.t) : ''}</span>
            <span className="eventlog__text">{e.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
