import { describe, expect, it } from 'vitest';
import type { MotionResult } from '@/lib/motion/commands';
import type { AgentResponse } from './agentApi';
import { describeOutcome } from './speak';

function agent(overrides: Partial<AgentResponse> = {}): AgentResponse {
  return {
    status: 'ready',
    confirmation: 'I understood that you want me to tap key 5 twice',
    steps: [],
    ...overrides,
  };
}

function result(overrides: Partial<MotionResult> = {}): MotionResult {
  return { commandId: 'cmd-1', ok: true, ...overrides };
}

describe('describeOutcome', () => {
  it('asks the clarifying question rather than reporting an outcome', () => {
    const line = describeOutcome({
      agentResult: agent({
        status: 'needs_clarification',
        clarifyingQuestion: 'Which direction should I nudge the tip?',
      }),
    });
    expect(line).toBe('Which direction should I nudge the tip?');
  });

  it('confirms understanding then explains a rejection', () => {
    const line = describeOutcome({
      agentResult: agent({
        status: 'rejected',
        failureReason: 'Target is outside the workspace radius',
      }),
      skipped: 'Target is outside the workspace radius',
    });
    expect(line).toBe(
      'I understood that you want me to tap key 5 twice. Target is outside the workspace radius.',
    );
  });

  it('confirms understanding then reports success', () => {
    const line = describeOutcome({ agentResult: agent(), result: result() });
    expect(line).toBe('I understood that you want me to tap key 5 twice. That is done.');
  });

  it('confirms understanding then reports why the motion failed', () => {
    const line = describeOutcome({
      agentResult: agent(),
      result: result({ ok: false, reason: 'Step 3 failed: unreachable' }),
    });
    expect(line).toBe(
      'I understood that you want me to tap key 5 twice. That failed: Step 3 failed: unreachable.',
    );
  });

  it('falls back to the error code when a failed motion carries no reason', () => {
    const line = describeOutcome({
      agentResult: agent(),
      result: result({ ok: false, error: 'joint_limit' }),
    });
    expect(line).toBe(
      'I understood that you want me to tap key 5 twice. That failed: joint_limit.',
    );
  });

  it('reports a plan that was never dispatched', () => {
    const line = describeOutcome({
      agentResult: agent(),
      skipped: 'Robot pose changed while the instruction was being planned. Please try again.',
    });
    expect(line).toBe(
      'I understood that you want me to tap key 5 twice. Robot pose changed while the instruction was being planned. Please try again.',
    );
  });

  // The backend surfaces raw provider/Pydantic dumps here; reading one aloud is useless.
  it('speaks only the first line of a multi-line failure reason', () => {
    const line = describeOutcome({
      agentResult: agent({
        status: 'rejected',
        confirmation: 'I could not safely interpret that instruction.',
        failureReason:
          "OpenRouter could not produce a valid plan: 1 validation error for AgentDraft\nsteps.0.action\n  Input tag 'move_tip' found using 'type' does not match any of the expected tags",
      }),
    });
    expect(line).toBe(
      'I could not safely interpret that instruction. OpenRouter could not produce a valid plan: 1 validation error for AgentDraft.',
    );
  });

  it('truncates an overlong failure reason at a word boundary', () => {
    const line = describeOutcome({
      agentResult: agent({ status: 'rejected', confirmation: 'Understood.', failureReason: 'word '.repeat(60).trim() }),
    });
    expect(line).toMatch(/…$/);
    expect(line!.length).toBeLessThan(200);
    expect(line).not.toMatch(/wor…$/); // cut between words, not mid-word
  });

  it('speaks the skip reason on the deterministic path', () => {
    const line = describeOutcome({ skipped: 'Robot is not ready yet.' });
    expect(line).toBe('Robot is not ready yet.');
  });

  it('speaks the failure reason for a deterministic command the pipeline rejected', () => {
    const line = describeOutcome({ result: result({ ok: false, reason: 'Target is unreachable' }) });
    expect(line).toBe('Target is unreachable.');
  });

  it('stays silent when a deterministic command simply executed', () => {
    expect(describeOutcome({ result: result() })).toBeNull();
  });

  it('stays silent when there is nothing to report', () => {
    expect(describeOutcome({})).toBeNull();
  });
});
