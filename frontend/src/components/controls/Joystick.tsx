'use client';

/**
 * Joystick.tsx — draggable on-screen joystick for jogging the stylus tip.
 * See docs/phase2-frontend-brief.md §4.1.
 *
 * The XY pad and the Z buttons share ONE `useContinuousJog` controller
 * instance so they never race each other's backend jog requests. Deliberately
 * lives in the control panel, not overlaid on the 3D canvas — its pointer
 * events must never compete with OrbitControls or the drag-to-rotate joints
 * in RobotScene.
 */

import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useContinuousJog } from '@/lib/motion/useContinuousJog';
import type { Vec3 } from '@/lib/motion/commands';

const BASE_SIZE = 132; // px
const KNOB_SIZE = 52; // px
const MAX_OFFSET = (BASE_SIZE - KNOB_SIZE) / 2; // px the knob can travel from center
const DEADZONE = 0.15; // fraction of MAX_OFFSET below which input is ignored

export default function Joystick() {
  const { setVector } = useContinuousJog();
  const baseRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);
  const xy = useRef<Vec3>({ x: 0, y: 0, z: 0 });
  const z = useRef(0);

  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [zHeld, setZHeld] = useState<'up' | 'down' | null>(null);

  const publish = () => {
    setVector({ x: xy.current.x, y: xy.current.y, z: z.current });
  };

  const updateFromClient = (clientX: number, clientY: number) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    let dx = clientX - cx;
    let dy = clientY - cy;
    const rawDist = Math.hypot(dx, dy);
    if (rawDist > MAX_OFFSET) {
      dx = (dx / rawDist) * MAX_OFFSET;
      dy = (dy / rawDist) * MAX_OFFSET;
    }
    setKnobPos({ x: dx, y: dy });

    const dist = Math.hypot(dx, dy);
    const norm = dist / MAX_OFFSET;
    if (norm < DEADZONE || dist === 0) {
      xy.current = { x: 0, y: 0, z: 0 };
      publish();
      return;
    }

    const ux = dx / dist;
    const uy = dy / dist;
    // Screen-down is +pixels, but "stick up" should jog +Y in the world/base
    // frame the scene renders in — hence the sign flip on Y only.
    xy.current = { x: ux, y: -uy, z: 0 };
    publish();
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointer.current = e.pointerId;
    setDragging(true);
    updateFromClient(e.clientX, e.clientY);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== e.pointerId) return;
    updateFromClient(e.clientX, e.clientY);
  };

  const release = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== e.pointerId) return;
    activePointer.current = null;
    setDragging(false);
    setKnobPos({ x: 0, y: 0 });
    xy.current = { x: 0, y: 0, z: 0 };
    publish();
  };

  const holdZ = (dir: 'up' | 'down' | null) => {
    setZHeld(dir);
    z.current = dir === 'up' ? 1 : dir === 'down' ? -1 : 0;
    publish();
  };

  // Safety: stop jogging if this control unmounts mid-drag.
  useEffect(() => () => setVector({ x: 0, y: 0, z: 0 }), [setVector]);

  return (
    <div className="joystick">
      <div className="joystick__row">
        <div
          ref={baseRef}
          className={`joystick__base ${dragging ? 'joystick__base--active' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={release}
          onPointerCancel={release}
          style={{ width: BASE_SIZE, height: BASE_SIZE }}
        >
          <div className="joystick__ring" />
          <div
            className="joystick__knob"
            style={{
              width: KNOB_SIZE,
              height: KNOB_SIZE,
              transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
            }}
          />
        </div>

        <div className="joystick__zcol">
          <button
            type="button"
            className={`joystick__zbtn ${zHeld === 'up' ? 'joystick__zbtn--active' : ''}`}
            onPointerDown={() => holdZ('up')}
            onPointerUp={() => holdZ(null)}
            onPointerLeave={() => zHeld === 'up' && holdZ(null)}
          >
            Z ▲
          </button>
          <button
            type="button"
            className={`joystick__zbtn ${zHeld === 'down' ? 'joystick__zbtn--active' : ''}`}
            onPointerDown={() => holdZ('down')}
            onPointerUp={() => holdZ(null)}
            onPointerLeave={() => zHeld === 'down' && holdZ(null)}
          >
            Z ▼
          </button>
        </div>
      </div>
      <div className="joystick__label">Drag to jog XY · hold Z ▲▼ · world frame</div>
    </div>
  );
}
