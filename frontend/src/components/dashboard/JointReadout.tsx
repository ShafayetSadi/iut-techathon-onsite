'use client';

import { useMotionStore } from '@/lib/motion/store';
import { useViewerStore } from '@/lib/viewer/viewerStore';
import { JOINTS } from '@/config/robot.config';

const RAD2DEG = 180 / Math.PI;

export default function JointReadout() {
  const jointAngles = useMotionStore((s) => s.jointAngles);
  const useDegrees = useViewerStore((s) => s.useDegrees);
  const unit = useDegrees ? '°' : 'rad';

  return (
    <div className="readout">
      <div className="readout__title">Joint angles</div>
      <div className="jointtable">
        {JOINTS.map((j, i) => {
          const [lo, hi] = j.limit;
          const val = jointAngles[i] ?? 0;
          const pct = ((val - lo) / (hi - lo)) * 100;
          const shown = useDegrees ? val * RAD2DEG : val;
          return (
            <div className="jointtable__row" key={j.name}>
              <span className="jointtable__label" title={j.name}>
                {j.label}
              </span>
              <span className="jointtable__bar">
                <span
                  className="jointtable__fill"
                  style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                />
              </span>
              <span className="jointtable__value">
                {shown.toFixed(useDegrees ? 1 : 3)}
                <span className="jointtable__unit">{unit}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
