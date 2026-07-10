'use client';

import { useMotionStore } from '@/lib/motion/store';

function mm(v: number): string {
  return (v * 1000).toFixed(1);
}

export default function EEReadout() {
  const ee = useMotionStore((s) => s.eePosition);
  const target = useMotionStore((s) => s.target);

  return (
    <div className="readout">
      <div className="readout__title">End-effector (stylus tip)</div>
      <div className="xyz">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <div className="xyz__cell" key={axis}>
            <span className={`xyz__axis xyz__axis--${axis}`}>{axis.toUpperCase()}</span>
            <span className="xyz__val">{mm(ee[axis])}</span>
            <span className="xyz__unit">mm</span>
          </div>
        ))}
      </div>
      {target && (
        <div className="xyz xyz--target">
          <div className="readout__subtitle">target</div>
          {(['x', 'y', 'z'] as const).map((axis) => (
            <div className="xyz__cell" key={axis}>
              <span className={`xyz__axis xyz__axis--${axis}`}>{axis.toUpperCase()}</span>
              <span className="xyz__val">{mm(target[axis])}</span>
              <span className="xyz__unit">mm</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
