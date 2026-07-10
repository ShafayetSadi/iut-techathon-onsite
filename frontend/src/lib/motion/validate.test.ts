import { describe, expect, it } from 'vitest';
import { MAX_JOG_STEP_M, validateCommand, withinJointLimit } from './validate';

describe('validateCommand jog_cartesian', () => {
  it('rejects a one-metre jog before it reaches the backend', () => {
    const result = validateCommand({
      type: 'jog_cartesian',
      delta: { x: 1, y: 0, z: 0 },
      frame: 'world',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('workspace_bounds');
      expect(result.reason).toBe('Jog of 1000 mm exceeds the 300 mm single-command limit.');
    }
  });

  it('allows the existing 250 mm Cartesian button step', () => {
    expect(
      validateCommand({
        type: 'jog_cartesian',
        delta: { x: MAX_JOG_STEP_M - 0.05, y: 0, z: 0 },
        frame: 'world',
      }),
    ).toEqual({ ok: true });
  });

  it('rejects non-finite jog deltas as malformed', () => {
    const result = validateCommand({
      type: 'jog_cartesian',
      delta: { x: Number.NaN, y: 0, z: 0 },
      frame: 'world',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('malformed');
  });
});

describe('withinJointLimit', () => {
  it('returns the URDF joint-limit reason for out-of-range targets', () => {
    const result = withinJointLimit(1, 200 * (Math.PI / 180));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('joint_limit');
      expect(result.reason).toMatch(/Joint 1 value .* outside limits/);
    }
  });
});
