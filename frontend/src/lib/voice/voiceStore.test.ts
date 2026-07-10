import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceStore } from './voiceStore';

const plan = {
  confirmation: 'Direction is unclear.',
  steps: [{
    id: 'move',
    sourceText: 'move it',
    intent: 'move',
    analysis: 'direction missing',
    status: 'ambiguous' as const,
  }],
};

describe('pending agent clarification', () => {
  beforeEach(() => {
    useVoiceStore.setState({ entries: [], pendingPlan: null, recording: false });
    vi.useRealTimers();
  });

  it('retains a pending plan for the clarification turn', () => {
    useVoiceStore.getState().setPendingPlan(plan);
    expect(useVoiceStore.getState().getPendingPlan()).toEqual(plan);
  });

  it('expires a pending plan after two minutes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T10:00:00Z'));
    useVoiceStore.getState().setPendingPlan(plan);
    vi.advanceTimersByTime(120_001);

    expect(useVoiceStore.getState().getPendingPlan()).toBeUndefined();
    expect(useVoiceStore.getState().pendingPlan).toBeNull();
    vi.useRealTimers();
  });
});
