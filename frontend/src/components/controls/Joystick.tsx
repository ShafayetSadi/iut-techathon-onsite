'use client';

/**
 * Joystick.tsx — draggable on-screen joystick for jogging the stylus tip.
 * See docs/phase2-frontend-brief.md §4.1.
 *
 * The XY pad and the Z slider share ONE `useContinuousJog` controller
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

const Z_SLIDER_HEIGHT = 132; // px — match XY pad height
const Z_THUMB_SIZE = 22; // px
const Z_MAX_OFFSET = (Z_SLIDER_HEIGHT - Z_THUMB_SIZE) / 2;
const Z_DEADZONE = 0.12;

type ArrowDir = 'up' | 'down' | 'left' | 'right';

const ARROW_VECTOR: Record<ArrowDir, Vec3> = {
  up: { x: 0, y: 1, z: 0 },
  down: { x: 0, y: -1, z: 0 },
  left: { x: -1, y: 0, z: 0 },
  right: { x: 1, y: 0, z: 0 },
};

const ARROW_KNOB: Record<ArrowDir, { x: number; y: number }> = {
  up: { x: 0, y: -MAX_OFFSET * 0.55 },
  down: { x: 0, y: MAX_OFFSET * 0.55 },
  left: { x: -MAX_OFFSET * 0.55, y: 0 },
  right: { x: MAX_OFFSET * 0.55, y: 0 },
};

const ARROWS: { dir: ArrowDir; label: string; className: string }[] = [
  { dir: 'up', label: 'Jog Y positive', className: 'joystick__arrow--up' },
  { dir: 'left', label: 'Jog X negative', className: 'joystick__arrow--left' },
  { dir: 'right', label: 'Jog X positive', className: 'joystick__arrow--right' },
  { dir: 'down', label: 'Jog Y negative', className: 'joystick__arrow--down' },
];

export default function Joystick() {
  const { setVector } = useContinuousJog();
  const baseRef = useRef<HTMLDivElement>(null);
  const zSliderRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);
  const zActivePointer = useRef<number | null>(null);
  const arrowHeld = useRef<ArrowDir | null>(null);
  const xy = useRef<Vec3>({ x: 0, y: 0, z: 0 });
  const z = useRef(0);

  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [zThumbOffset, setZThumbOffset] = useState(0);
  const [zDragging, setZDragging] = useState(false);
  const [arrowActive, setArrowActive] = useState<ArrowDir | null>(null);

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
    xy.current = { x: ux, y: -uy, z: 0 };
    publish();
  };

  const holdArrow = (dir: ArrowDir | null) => {
    arrowHeld.current = dir;
    setArrowActive(dir);
    if (dragging) return;
    if (!dir) {
      setKnobPos({ x: 0, y: 0 });
      xy.current = { x: 0, y: 0, z: 0 };
      publish();
      return;
    }
    xy.current = ARROW_VECTOR[dir];
    setKnobPos(ARROW_KNOB[dir]);
    publish();
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    holdArrow(null);
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
    if (arrowHeld.current) {
      const dir = arrowHeld.current;
      xy.current = ARROW_VECTOR[dir];
      setKnobPos(ARROW_KNOB[dir]);
    } else {
      setKnobPos({ x: 0, y: 0 });
      xy.current = { x: 0, y: 0, z: 0 };
    }
    publish();
  };

  const onArrowPointerDown = (dir: ArrowDir) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    holdArrow(dir);
  };

  const onArrowPointerUp = (dir: ArrowDir) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (arrowHeld.current !== dir) return;
    holdArrow(null);
  };

  const updateZFromClient = (clientY: number) => {
    const slider = zSliderRef.current;
    if (!slider) return;
    const rect = slider.getBoundingClientRect();
    const cy = rect.top + rect.height / 2;

    let dy = clientY - cy;
    if (dy < -Z_MAX_OFFSET) dy = -Z_MAX_OFFSET;
    if (dy > Z_MAX_OFFSET) dy = Z_MAX_OFFSET;
    setZThumbOffset(dy);

    const norm = Math.abs(dy) / Z_MAX_OFFSET;
    if (norm < Z_DEADZONE) {
      z.current = 0;
    } else {
      const eased = (norm - Z_DEADZONE) / (1 - Z_DEADZONE);
      // Screen-up (negative dy) → +Z in the world/base frame.
      z.current = dy < 0 ? eased : -eased;
    }
    publish();
  };

  const onZPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    zActivePointer.current = e.pointerId;
    setZDragging(true);
    updateZFromClient(e.clientY);
  };

  const onZPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (zActivePointer.current !== e.pointerId) return;
    updateZFromClient(e.clientY);
  };

  const releaseZ = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (zActivePointer.current !== e.pointerId) return;
    zActivePointer.current = null;
    setZDragging(false);
    setZThumbOffset(0);
    z.current = 0;
    publish();
  };

  useEffect(() => () => setVector({ x: 0, y: 0, z: 0 }), [setVector]);

  return (
    <div className="joystick">
      <div className="joystick__row">
        <div className="joystick__pad">
          {ARROWS.map(({ dir, label, className }) => (
            <button
              key={dir}
              type="button"
              className={`joystick__arrow ${className} ${arrowActive === dir ? 'joystick__arrow--active' : ''}`}
              aria-label={label}
              onPointerDown={onArrowPointerDown(dir)}
              onPointerUp={onArrowPointerUp(dir)}
              onPointerCancel={onArrowPointerUp(dir)}
              onPointerLeave={onArrowPointerUp(dir)}
            >
              <span className="joystick__arrow-icon" aria-hidden="true" />
            </button>
          ))}
          <div
            ref={baseRef}
            className={`joystick__base ${dragging ? 'joystick__base--active' : ''}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={release}
            onPointerCancel={release}
            style={{ width: BASE_SIZE, height: BASE_SIZE }}
          >
            <span className="joystick__axis joystick__axis--y" aria-hidden="true">
              Y
            </span>
            <span className="joystick__axis joystick__axis--x" aria-hidden="true">
              X
            </span>
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
        </div>

        <div className="joystick__zwrap">
          <span className="joystick__zlabel">Z</span>
          <div
            ref={zSliderRef}
            className={`joystick__zslider ${zDragging ? 'joystick__zslider--active' : ''}`}
            style={{ height: Z_SLIDER_HEIGHT }}
            onPointerDown={onZPointerDown}
            onPointerMove={onZPointerMove}
            onPointerUp={releaseZ}
            onPointerCancel={releaseZ}
          >
            <div className="joystick__ztrack" />
            <div className="joystick__ztick joystick__ztick--top" aria-hidden="true" />
            <div className="joystick__ztick joystick__ztick--bottom" aria-hidden="true" />
            <div
              className="joystick__zthumb"
              style={{
                width: Z_THUMB_SIZE,
                height: Z_THUMB_SIZE,
                transform: `translateY(${zThumbOffset}px)`,
              }}
            />
          </div>
        </div>
      </div>
      <div className="joystick__label">Drag or use arrows for XY · slide Z · world frame</div>
    </div>
  );
}
