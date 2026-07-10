'use client';

/**
 * JointSliders.tsx — one slider + numeric input per joint, the gkjohnson-style
 * control sidebar. Every edit writes to the store (setJoint), never to the robot
 * directly, so the store stays authoritative. The row for the joint currently
 * hovered in the 3D view is highlighted.
 */

import { useMotionStore } from '@/lib/motion/store';
import { useViewerStore } from '@/lib/viewer/viewerStore';
import { JOINTS } from '@/config/robot.config';

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;
const WIDE = 2 * Math.PI;

export default function JointSliders() {
  const jointAngles = useMotionStore((s) => s.jointAngles);
  const setJoint = useMotionStore((s) => s.setJoint);
  const ignoreLimits = useMotionStore((s) => s.ignoreLimits);
  const isAutoRunning = useMotionStore((s) => s.mode === 'auto' && s.status === 'moving' && s.activePin !== null);
  const useDegrees = useViewerStore((s) => s.useDegrees);
  const hovered = useViewerStore((s) => s.hoveredJoint);
  const setHovered = useViewerStore((s) => s.setHoveredJoint);

  return (
    <div className="sliders">
      {JOINTS.map((j, i) => {
        const [limLo, limHi] = j.limit;
        const lo = ignoreLimits ? -WIDE : limLo;
        const hi = ignoreLimits ? WIDE : limHi;
        const val = jointAngles[i] ?? 0;
        const disp = useDegrees ? val * RAD2DEG : val;
        const mult = useDegrees ? RAD2DEG : 1;
        const isHover = hovered === j.name;

        return (
          <div
            className={`slider ${isHover ? 'slider--hover' : ''}`}
            key={j.name}
            onMouseEnter={() => setHovered(j.name)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className="slider__head">
              <span className="slider__name" title={j.name}>
                {j.label}
              </span>
              <input
                className="slider__num"
                type="number"
                step={useDegrees ? 1 : 0.01}
                min={lo * mult}
                max={hi * mult}
                value={Number(disp.toFixed(useDegrees ? 1 : 3))}
                disabled={isAutoRunning}
                onChange={(e) => {
                  const raw = parseFloat(e.target.value);
                  if (!isAutoRunning && Number.isFinite(raw)) setJoint(i, useDegrees ? raw * DEG2RAD : raw);
                }}
              />
              <span className="slider__unit">{useDegrees ? '°' : 'rad'}</span>
            </div>
            <input
              className="slider__range"
              type="range"
              min={lo}
              max={hi}
              step={0.0001}
              value={val}
              disabled={isAutoRunning}
              onChange={(e) => {
                if (!isAutoRunning) setJoint(i, parseFloat(e.target.value));
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
