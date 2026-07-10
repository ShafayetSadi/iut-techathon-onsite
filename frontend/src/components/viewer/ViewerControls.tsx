'use client';

import { useMotionStore } from '@/lib/motion/store';
import { useViewerStore, type ViewerState } from '@/lib/viewer/viewerStore';

type ToggleKey = Exclude<keyof ViewerState, 'toggle' | 'set' | 'setHoveredJoint' | 'hoveredJoint'>;

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
  const ignoreLimits = useMotionStore((s) => s.ignoreLimits);
  const setIgnoreLimits = useMotionStore((s) => s.setIgnoreLimits);

  return (
    <div className="controls">
      <div className="controls__row">
        <button className="btn btn--primary" onClick={home} type="button">
          ⌂ Home
        </button>
        <button
          className={`toggle ${ignoreLimits ? 'toggle--on' : ''}`}
          onClick={() => setIgnoreLimits(!ignoreLimits)}
          type="button"
        >
          <span className="toggle__dot" />
          Ignore limits
        </button>
      </div>
      <div className="controls__grid">
        <Toggle label="Collision" k="showCollision" />
        <Toggle label="Degrees" k="useDegrees" />
        <Toggle label="Key labels" k="showKeyLabels" />
        <Toggle label="Test marker" k="showTestMarker" />
        <Toggle label="EE marker" k="showEEMarker" />
        <Toggle label="Auto-rotate" k="autoRotate" />
      </div>
      <p className="controls__hint">
        Drag a joint in the 3D view to rotate it · drag empty space to orbit · scroll to zoom
      </p>
    </div>
  );
}
