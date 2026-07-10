import { describe, expect, it } from 'vitest';
import {
  continuousJogDelta,
  FINE_JOG_STEP_M,
  JOG_STEP_M,
} from './useContinuousJog';

function magnitude(v: { x: number; y: number; z: number }): number {
  return Math.hypot(v.x, v.y, v.z);
}

describe('continuousJogDelta', () => {
  it('uses the same fixed normal step for cardinal directions', () => {
    const directions = [
      { x: -1, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 1, z: 0 },
    ];

    for (const direction of directions) {
      const delta = continuousJogDelta(direction);
      expect(delta).not.toBeNull();
      expect(magnitude(delta!)).toBeCloseTo(JOG_STEP_M, 8);
    }
  });

  it('normalizes diagonal input to one fixed total step', () => {
    const delta = continuousJogDelta({ x: 1, y: 1, z: 0 });

    expect(delta).not.toBeNull();
    expect(magnitude(delta!)).toBeCloseTo(JOG_STEP_M, 8);
    expect(delta!.x).toBeCloseTo(delta!.y, 8);
  });

  it.each([
    [1, 0.001],
    [5, 0.005],
    [10, 0.01],
  ])('can emit a selected %i mm step for backend jog deltas', (_label, meters) => {
    const delta = continuousJogDelta({ x: 0, y: 0, z: 1 }, meters);

    expect(delta).not.toBeNull();
    expect(magnitude(delta!)).toBeCloseTo(meters, 8);
  });

  it('ignores zero and tiny input', () => {
    expect(continuousJogDelta({ x: 0, y: 0, z: 0 })).toBeNull();
    expect(continuousJogDelta({ x: 0.0001, y: 0, z: 0 })).toBeNull();
  });

  it('can emit the fixed fine step', () => {
    const delta = continuousJogDelta({ x: 0, y: 0, z: -1 }, FINE_JOG_STEP_M);

    expect(delta).not.toBeNull();
    expect(magnitude(delta!)).toBeCloseTo(FINE_JOG_STEP_M, 8);
  });
});
