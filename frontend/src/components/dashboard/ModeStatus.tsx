'use client';

import { useMotionStore } from '@/lib/motion/store';

const STATUS_STYLE: Record<string, string> = {
  ready: 'pill pill--ok',
  moving: 'pill pill--warn',
  error: 'pill pill--err',
};

export default function ModeStatus() {
  const mode = useMotionStore((s) => s.mode);
  const status = useMotionStore((s) => s.status);
  const robotReady = useMotionStore((s) => s.robotReady);

  return (
    <div className="modestatus">
      <span className={STATUS_STYLE[status] ?? 'pill'}>{status.toUpperCase()}</span>
      <span className="pill pill--mode">mode: {mode}</span>
      <span className={robotReady ? 'pill pill--ok' : 'pill pill--warn'}>
        {robotReady ? 'URDF ready' : 'loading…'}
      </span>
    </div>
  );
}
