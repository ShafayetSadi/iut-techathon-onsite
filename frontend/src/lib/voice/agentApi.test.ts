import { afterEach, describe, expect, it, vi } from 'vitest';
import { interpretAgent } from './agentApi';

afterEach(() => vi.unstubAllGlobals());

describe('interpretAgent', () => {
  it('posts raw speech, joints, and deterministic alternatives', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'needs_clarification', confirmation: 'Direction is unclear.', steps: [], clarifyingQuestion: 'Which direction?',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await interpretAgent(
      'move it please',
      { status: 'ambiguous', normalized: 'move', alternatives: [{ template: 'move up', confidence: 0.9 }] },
      [1, 2, 3, 4, 5, 6, 7],
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.transcript).toBe('move it please');
    expect(body.resolutionStatus).toBe('ambiguous');
    expect(body.currentJoints.joint_1).toBe(1);
    expect(body.alternatives[0].template).toBe('move up');
  });

  it('surfaces backend errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400, json: async () => ({ reason: 'bad plan' }),
    }));

    await expect(
      interpretAgent('bad', { status: 'unmatched', normalized: 'bad' }, new Array(7).fill(0)),
    ).rejects.toThrow('bad plan');
  });
});
