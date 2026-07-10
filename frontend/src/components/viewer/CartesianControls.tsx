'use client';

import { useState } from 'react';
import { useMotionStore } from '@/lib/motion/store';
import type { Vec3 } from '@/lib/motion/commands';

const JOG_STEP_M = 0.02;

function metersFromMm(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed / 1000 : 0;
}

export default function CartesianControls() {
  const dispatch = useMotionStore((s) => s.dispatch);
  const eePosition = useMotionStore((s) => s.eePosition);
  const status = useMotionStore((s) => s.status);
  const [target, setTarget] = useState({ x: '550', y: '-50', z: '50' });

  const jog = (axis: 'x' | 'y' | 'z', delta: number) => {
    void dispatch({
      type: 'jog_cartesian',
      delta: {
        x: axis === 'x' ? delta : 0,
        y: axis === 'y' ? delta : 0,
        z: axis === 'z' ? delta : 0,
      },
    });
  };

  const moveTo = () => {
    const next: Vec3 = {
      x: metersFromMm(target.x),
      y: metersFromMm(target.y),
      z: metersFromMm(target.z),
    };
    void dispatch({ type: 'move_to', target: next });
  };

  const loadCurrent = () => {
    setTarget({
      x: (eePosition.x * 1000).toFixed(0),
      y: (eePosition.y * 1000).toFixed(0),
      z: (eePosition.z * 1000).toFixed(0),
    });
  };

  return (
    <div className="cartesian">
      <div className="cartesian__grid">
        <button className="btn" type="button" onClick={() => jog('z', JOG_STEP_M)}>
          Z+
        </button>
        <button className="btn" type="button" onClick={() => jog('y', JOG_STEP_M)}>
          Y+
        </button>
        <button className="btn" type="button" onClick={() => jog('x', JOG_STEP_M)}>
          X+
        </button>
        <button className="btn" type="button" onClick={() => jog('z', -JOG_STEP_M)}>
          Z-
        </button>
        <button className="btn" type="button" onClick={() => jog('y', -JOG_STEP_M)}>
          Y-
        </button>
        <button className="btn" type="button" onClick={() => jog('x', -JOG_STEP_M)}>
          X-
        </button>
      </div>

      <div className="targetbox">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <label className="targetbox__field" key={axis}>
            <span>{axis.toUpperCase()} mm</span>
            <input
              value={target[axis]}
              onChange={(event) => setTarget((prev) => ({ ...prev, [axis]: event.target.value }))}
              inputMode="decimal"
            />
          </label>
        ))}
      </div>

      <div className="controls__row">
        <button className="btn btn--primary" type="button" onClick={moveTo} disabled={status === 'moving'}>
          Solve IK
        </button>
        <button className="btn" type="button" onClick={loadCurrent}>
          Use EE
        </button>
      </div>
    </div>
  );
}

export function KeyTouchControls() {
  const dispatch = useMotionStore((s) => s.dispatch);
  const status = useMotionStore((s) => s.status);

  return (
    <div className="keypad">
      {['1', '2', '3', '4', '5', '6'].map((key) => (
        <button
          className="btn"
          key={key}
          type="button"
          disabled={status === 'moving'}
          onClick={() => void dispatch({ type: 'touch_key', key })}
        >
          Key {key}
        </button>
      ))}
    </div>
  );
}

