'use client';

import { useMemo, useState } from 'react';
import { useMotionStore } from '@/lib/motion/store';

const PIN_PATTERN = /^[1-6]{6}$/;
const DEMO_PIN = '123456';

export default function PinEntryControls() {
  const dispatch = useMotionStore((s) => s.dispatch);
  const status = useMotionStore((s) => s.status);
  const mode = useMotionStore((s) => s.mode);
  const activePin = useMotionStore((s) => s.activePin);
  const pinProgress = useMotionStore((s) => s.pinProgress);
  const autoError = useMotionStore((s) => s.autoError);
  const [pin, setPin] = useState(DEMO_PIN);

  const isRunning = mode === 'auto' && status === 'moving' && activePin !== null;
  const valid = PIN_PATTERN.test(pin);
  const cells = useMemo(() => {
    if (pinProgress.length > 0) return pinProgress;
    return Array.from({ length: 6 }, (_, index) => ({
      index: index + 1,
      digit: pin[index] ?? '',
      status: 'pending' as const,
    }));
  }, [pin, pinProgress]);

  const run = () => {
    if (!valid || isRunning) return;
    void dispatch({ type: 'enter_pin', pin });
  };

  const stop = () => {
    if (!isRunning) return;
    void dispatch({ type: 'stop' });
  };

  return (
    <div className="pin-entry">
      <div className="pin-entry__row">
        <input
          className="pin-entry__input"
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/[^1-6]/g, '').slice(0, 6))}
          inputMode="numeric"
          maxLength={6}
          aria-label="Six digit PIN using keys 1 through 6"
          disabled={isRunning}
        />
        <button className="btn btn--primary" type="button" onClick={run} disabled={!valid || isRunning}>
          Run PIN
        </button>
      </div>

      <div className="pin-entry__row">
        <button className="btn" type="button" onClick={() => setPin(DEMO_PIN)} disabled={isRunning}>
          Demo PIN
        </button>
        <button className="btn" type="button" onClick={stop} disabled={!isRunning}>
          Stop
        </button>
      </div>

      <div className="pin-progress" aria-label="PIN progress">
        {cells.map((cell) => (
          <div className={`pin-progress__cell pin-progress__cell--${cell.status}`} key={cell.index}>
            <span className="pin-progress__digit">{cell.digit || '-'}</span>
            <span className="pin-progress__meta">
              {cell.status === 'pressed' && cell.errorMm != null
                ? `${cell.errorMm.toFixed(1)}mm`
                : cell.status}
            </span>
          </div>
        ))}
      </div>

      {autoError && <div className="pin-entry__error">{autoError}</div>}
    </div>
  );
}
