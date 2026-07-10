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

describe('agent chat history', () => {
  beforeEach(() => {
    useVoiceStore.setState({ entries: [], pendingPlan: null, recording: false });
  });

  it('includes final user and assistant messages, capped to the last ten bubbles', () => {
    for (let index = 0; index < 6; index += 1) {
      const id = useVoiceStore.getState().beginTranscript();
      useVoiceStore.getState().resolveTranscript(id, `request ${index}`);
      useVoiceStore.getState().attachResult(id, {
        agentResult: {
          status: 'ready',
          confirmation: `I understood that you want me to handle request ${index}.`,
          steps: [],
        },
      });
    }

    const history = useVoiceStore.getState().buildAgentChatHistory();

    expect(history).toHaveLength(10);
    expect(history[0]).toMatchObject({ role: 'user', content: 'request 1' });
    expect(history[9]).toMatchObject({
      role: 'assistant',
      content: 'I understood that you want me to handle request 5.',
    });
  });

  it('skips pending placeholders and unresolved agent-pending assistant text', () => {
    useVoiceStore.getState().beginTranscript();
    const id = useVoiceStore.getState().beginTranscript();
    useVoiceStore.getState().resolveTranscript(id, 'press one to three in order');
    useVoiceStore.getState().markAgentPending(id);

    expect(useVoiceStore.getState().buildAgentChatHistory()).toEqual([
      { role: 'user', content: 'press one to three in order', t: expect.any(Number) },
    ]);
  });
});
