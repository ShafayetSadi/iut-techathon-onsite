import { describe, expect, it } from 'vitest';
import type { MotionResult } from '@/lib/motion/commands';
import type { AgentResponse } from './agentApi';
import { describeOutcome, humanizeVoiceError } from './speak';

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
      'I understood that you want me to tap key 5 twice. That move is outside the robot\'s safe workspace.',
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
      'I understood that you want me to tap key 5 twice. I cannot reach that target safely.',
    );
  });

  it('falls back to the error code when a failed motion carries no reason', () => {
    const line = describeOutcome({
      agentResult: agent(),
      result: result({ ok: false, error: 'joint_limit' }),
    });
    expect(line).toBe(
      'I understood that you want me to tap key 5 twice. That move would exceed a joint limit.',
    );
  });

  it('reports a plan that was never dispatched', () => {
    const line = describeOutcome({
      agentResult: agent(),
      skipped: 'Robot pose changed while the instruction was being planned. Please try again.',
    });
    expect(line).toBe(
      'I understood that you want me to tap key 5 twice. The robot moved while I was planning. Please say the command again.',
    );
  });

  it('humanizes a multi-line provider or validation dump', () => {
    const line = describeOutcome({
      agentResult: agent({
        status: 'rejected',
        confirmation: 'I could not safely interpret that instruction.',
        failureReason:
          "OpenRouter could not produce a valid plan: 1 validation error for AgentDraft\nsteps.0.action\n  Input tag 'move_tip' found using 'type' does not match any of the expected tags",
      }),
    });
    expect(line).toBe(
      'I could not safely interpret that instruction. I could not safely plan that instruction. Please try phrasing it a little differently.',
    );
    expect(line).not.toContain('validation error');
    expect(line).not.toContain('Input tag');
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
    expect(line).toBe('The robot is not ready yet. Please try again in a moment.');
  });

  it('speaks the failure reason for a deterministic command the pipeline rejected', () => {
    const line = describeOutcome({ result: result({ ok: false, reason: 'Target is unreachable' }) });
    expect(line).toBe('I cannot reach that target safely.');
  });

  it('stays silent when a deterministic command simply executed', () => {
    expect(describeOutcome({ result: result() })).toBeNull();
  });

  it('stays silent when there is nothing to report', () => {
    expect(describeOutcome({})).toBeNull();
  });
});

describe('humanizeVoiceError', () => {
  it('turns short or empty audio into an actionable retry prompt', () => {
    expect(humanizeVoiceError('Nothing was heard.')).toBe(
      'I could not hear enough audio. Hold the button while you speak, then try again.',
    );
    expect(humanizeVoiceError('audio_too_short')).toBe(
      'I could not hear enough audio. Hold the button while you speak, then try again.',
    );
  });

  it('does not leak backend validation details', () => {
    expect(
      humanizeVoiceError(
        "OpenRouter could not produce a valid plan: 1 validation error for AgentDraft\nsteps.0.action\nInput tag 'move_tip'",
      ),
    ).toBe('I could not safely plan that instruction. Please try phrasing it a little differently.');
  });

  it('humanizes common motion and concurrency failures', () => {
    expect(humanizeVoiceError('Previous voice command is still executing.')).toBe(
      'I am still finishing the previous voice command. Please wait a moment.',
    );
    expect(humanizeVoiceError('joint_limit')).toBe('That move would exceed a joint limit.');
    expect(humanizeVoiceError('Target is unreachable')).toBe('I cannot reach that target safely.');
  });
});
