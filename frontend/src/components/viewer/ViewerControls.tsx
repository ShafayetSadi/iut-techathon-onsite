'use client';

import { useMotionStore } from '@/lib/motion/store';
import { useViewerStore, type ViewerState } from '@/lib/viewer/viewerStore';

type ToggleKey = Exclude<
  keyof ViewerState,
  'toggle' | 'set' | 'setHoveredJoint' | 'hoveredJoint' | 'setJogStepMm' | 'jogStepMm'
>;

function Toggle({ label, k }: { label: string; k: ToggleKey }) {
  const value = useViewerStore((s) => s[k]) as boolean;
  const toggle = useViewerStore((s) => s.toggle);
  return (
    <button
      className={`toggle ${value ? 'toggle--on' : ''}`}
      onClick={() => toggle(k)}
      type="button"
    >
      <span className="toggle__dot" />
      {label}
    </button>
  );
}

export default function ViewerControls() {
  const home = useMotionStore((s) => s.home);
  const useDegrees = useViewerStore((s) => s.useDegrees);
  const set = useViewerStore((s) => s.set);

  return (
    <div className="controls">
      <div className="controls__group">
        <div className="controls__grouplabel">Display</div>
        <div className="controls__grid">
          <Toggle label="Key labels" k="showKeyLabels" />
          <Toggle label="EE marker" k="showEEMarker" />
          <Toggle label="Collision" k="showCollision" />
        </div>
      </div>

      <div className="controls__group">
        <div className="controls__grouplabel">Behavior</div>
        <div className="controls__grid controls__grid--single">
          <Toggle label="Auto-rotate" k="autoRotate" />
        </div>
      </div>

      <div className="controls__group">
        <div className="controls__grouplabel">Units</div>
        <div className="unit-toggle" role="group" aria-label="Angle units">
          <button
            className={`unit-toggle__btn ${useDegrees ? 'unit-toggle__btn--active' : ''}`}
            type="button"
            onClick={() => set('useDegrees', true)}
          >
            Degrees
          </button>
          <button
            className={`unit-toggle__btn ${!useDegrees ? 'unit-toggle__btn--active' : ''}`}
            type="button"
            onClick={() => set('useDegrees', false)}
          >
            Radians
          </button>
        </div>
      </div>

      <div className="controls__row">
        <button className="btn btn--primary" onClick={home} type="button">
          ⌂ Home arm
        </button>
      </div>

    </div>
  );
}
