'use client';

/**
 * KeyboardJog.tsx — non-visual keyboard alternative to the on-screen
 * joystick, driving the same `useContinuousJog` dispatcher. See
 * docs/phase2-frontend-brief.md §4.2. Mount once; renders nothing.
 */

import { useEffect, useRef } from 'react';
import { useContinuousJog } from '@/lib/motion/useContinuousJog';

const AXIS_KEYS: Record<string, { axis: 'x' | 'y' | 'z'; sign: 1 | -1 }> = {
  ArrowUp: { axis: 'y', sign: 1 },
  KeyW: { axis: 'y', sign: 1 },
  ArrowDown: { axis: 'y', sign: -1 },
  KeyS: { axis: 'y', sign: -1 },
  ArrowRight: { axis: 'x', sign: 1 },
  KeyD: { axis: 'x', sign: 1 },
  ArrowLeft: { axis: 'x', sign: -1 },
  KeyA: { axis: 'x', sign: -1 },
  KeyE: { axis: 'z', sign: 1 },
  PageUp: { axis: 'z', sign: 1 },
  KeyQ: { axis: 'z', sign: -1 },
  PageDown: { axis: 'z', sign: -1 },
};

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  const tag = element?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element?.isContentEditable === true;
}

export default function KeyboardJog() {
  const { setVector } = useContinuousJog();
  const held = useRef(new Set<string>());
  const fine = useRef(false);

  useEffect(() => {
    const recompute = () => {
      let x = 0;
      let y = 0;
      let z = 0;
      for (const code of held.current) {
        const mapping = AXIS_KEYS[code];
        if (!mapping) continue;
        if (mapping.axis === 'x') x += mapping.sign;
        else if (mapping.axis === 'y') y += mapping.sign;
        else z += mapping.sign;
      }
      const mag = Math.hypot(x, y, z);
      if (mag === 0) {
        setVector({ x: 0, y: 0, z: 0 });
        return;
      }
      setVector({ x: x / mag, y: y / mag, z: z / mag }, { fine: fine.current });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      fine.current = e.shiftKey;
      if (e.key === 'Shift') {
        recompute();
        return;
      }
      if (!AXIS_KEYS[e.code]) return;
      e.preventDefault();
      held.current.add(e.code);
      recompute();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      fine.current = e.shiftKey;
      if (e.key === 'Shift') {
        recompute();
        return;
      }
      if (!AXIS_KEYS[e.code]) return;
      held.current.delete(e.code);
      recompute();
    };

    const onBlur = () => {
      held.current.clear();
      recompute();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      held.current.clear();
      setVector({ x: 0, y: 0, z: 0 });
    };
  }, [setVector]);

  return null;
}
