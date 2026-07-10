import { describe, expect, it } from 'vitest';
import type { Resolution } from './matcher';
import { decideVoiceAction } from './execute';

const command = {
  type: 'jog_cartesian',
  delta: { x: 0, y: 0, z: 0.02 },
  frame: 'world',
} as const;

function matched(overrides: Partial<Resolution> = {}): Resolution {
  return {
    status: 'matched',
    normalized: 'move up',
    command,
    gate: { ok: true },
    ...overrides,
  };
}

describe('decideVoiceAction', () => {
  it('executes matched gated commands when the robot is ready and joystick is idle', () => {
    expect(
      decideVoiceAction(matched(), { continuousJogActive: false, robotReady: true }),
    ).toEqual({ kind: 'execute', command });
  });

  it('skips commands rejected by the safety gate', () => {
    expect(
      decideVoiceAction(matched({ gate: { ok: false, reason: 'too far' } }), {
        continuousJogActive: false,
        robotReady: true,
      }),
    ).toEqual({ kind: 'skip', reason: 'too far' });
  });

  it('refuses to execute while continuous jog is active', () => {
    expect(
      decideVoiceAction(matched(), { continuousJogActive: true, robotReady: true }),
    ).toEqual({ kind: 'skip', reason: 'Release the joystick before speaking a command.' });
  });

  it('routes ambiguous commands to the agent without guessing', () => {
    const resolution: Resolution = { status: 'ambiguous', normalized: 'move', reason: 'tie' };
    expect(
      decideVoiceAction(resolution, {
        continuousJogActive: false,
        robotReady: true,
      }),
    ).toEqual({ kind: 'agent', transcript: 'move', resolution, pendingPlan: undefined });
  });

  it('routes unmatched raw speech to the agent', () => {
    const resolution: Resolution = { status: 'unmatched', normalized: 'tap 5 twice' };
    expect(
      decideVoiceAction(resolution, { continuousJogActive: false, robotReady: true }, {
        transcript: 'tap the 5 key twice',
      }),
    ).toEqual({
      kind: 'agent',
      transcript: 'tap the 5 key twice',
      resolution,
      pendingPlan: undefined,
    });
  });

  it('sends a matched clarification reply back to the pending agent plan', () => {
    const pendingPlan = {
      confirmation: 'Direction is unclear.',
      steps: [{
        id: 'move', sourceText: 'move it', intent: 'move', analysis: 'direction missing', status: 'ambiguous' as const,
      }],
    };
    const resolution = matched();
    expect(
      decideVoiceAction(resolution, { continuousJogActive: false, robotReady: true }, {
        transcript: 'up', pendingPlan,
      }),
    ).toEqual({ kind: 'agent', transcript: 'up', resolution, pendingPlan });
  });
});
