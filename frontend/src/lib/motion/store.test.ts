import { describe, expect, it } from 'vitest';
import { jogResponseLog, jogSuccessLog, tipDistanceMm } from './store';

describe('jog movement log helpers', () => {
  it('measures actual tip displacement in millimeters', () => {
    const before = { x: -0.026, y: -0.004, z: 1.494 };
    const after = { x: -0.0212, y: -0.004, z: 1.494 };

    expect(tipDistanceMm(before, after)).toBeCloseTo(4.8, 8);
  });

  it('formats actual movement instead of requested movement', () => {
    expect(jogSuccessLog(0)).toBe('Jogged 0.0 mm.');
    expect(jogSuccessLog(4.8)).toBe('Jogged 4.8 mm.');
  });

  it('does not invent movement when the backend omits a tip', () => {
    expect(jogSuccessLog(null)).toBe('Jogged n/a mm.');
  });

  it('uses backend jog reasons for blocked movement', () => {
    expect(jogResponseLog({ reason: 'Jog blocked: requested direction is outside reach.' }, 0)).toBe(
      'Jog blocked: requested direction is outside reach.',
    );
  });
});
