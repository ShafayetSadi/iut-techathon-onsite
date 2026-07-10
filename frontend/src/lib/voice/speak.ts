/**
 * speak.ts — the agent talking back. See docs/problem_statement.md §5 (Phase 3B).
 *
 * The reasoning layer must confirm what it understood and then report the
 * outcome: succeeded, failed and why, or a clarifying question instead of a
 * guess. `describeOutcome` turns a `VoiceOutcome` into that sentence; `speak`
 * is the only part that touches the browser.
 */

import type { VoiceOutcome } from './execute';

/** Longest fallback failure notice worth speaking before it stops being useful. */
const MAX_SPOKEN_REASON = 160;

/** Ensure clauses join into speakable prose rather than running together. */
function sentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function concise(text: string): string {
  const firstLine = text.trim().split('\n')[0].trim();
  if (firstLine.length <= MAX_SPOKEN_REASON) return firstLine;
  const cut = firstLine.slice(0, MAX_SPOKEN_REASON);
  const boundary = cut.lastIndexOf(' ');
  return `${(boundary > 0 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

/**
 * Convert provider, backend, and motion failure details into operator-facing
 * speech. The raw strings can contain validation dumps; the conversation should
 * explain what to do next instead.
 */
export function humanizeVoiceError(reason: string | null | undefined): string {
  const raw = reason?.trim();
  if (!raw) return 'I could not complete that voice command. Please try again.';

  const lower = raw.toLowerCase();

  if (
    lower.includes('nothing was heard') ||
    lower.includes('audio_too_short') ||
    lower.includes('file is corrupted') ||
    lower.includes('hold the button')
  ) {
    return 'I could not hear enough audio. Hold the button while you speak, then try again.';
  }

  if (lower.includes('microphone permission') || lower.includes('permission denied')) {
    return 'I cannot access the microphone. Please allow microphone permission and try again.';
  }

  if (lower.includes('microphone unavailable') || lower.includes('getusermedia')) {
    return 'The microphone is not available here. Use localhost or HTTPS, then try again.';
  }

  if (lower.includes('transcription failed') || lower.includes('speech-to-text')) {
    return 'I could not turn that audio into text. Please try again.';
  }

  if (
    lower.includes('openrouter could not produce a valid plan') ||
    lower.includes('validation error') ||
    lower.includes('pydantic') ||
    lower.includes('json_schema') ||
    lower.includes('input tag')
  ) {
    return 'I could not safely plan that instruction. Please try phrasing it a little differently.';
  }

  if (lower.includes('agentic control is not configured')) {
    return 'The AI planner is not set up yet, so I cannot use open-ended voice commands.';
  }

  if (lower.includes('robot pose changed')) {
    return 'The robot moved while I was planning. Please say the command again.';
  }

  if (lower.includes('previous voice command')) {
    return 'I am still finishing the previous voice command. Please wait a moment.';
  }

  if (lower.includes('release the joystick')) {
    return 'Release the joystick before giving a voice command.';
  }

  if (lower.includes('robot is not ready')) {
    return 'The robot is not ready yet. Please try again in a moment.';
  }

  if (lower.includes('pending agent plan cancelled')) {
    return 'I cancelled the pending plan.';
  }

  if (lower.includes('workspace') || lower.includes('outside')) {
    return 'That move is outside the robot\'s safe workspace.';
  }

  if (lower.includes('joint_limit') || lower.includes('joint limit')) {
    return 'That move would exceed a joint limit.';
  }

  if (lower.includes('unreachable') || lower.includes('cannot reach')) {
    return 'I cannot reach that target safely.';
  }

  if (lower.includes('safety gate') || lower.includes('unsafe') || lower.includes('rejected')) {
    return 'I could not run that safely.';
  }

  return concise(raw);
}

function join(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).map((part) => sentence(part as string)).join(' ');
}

function whyItFailed(outcome: VoiceOutcome): string {
  const { result } = outcome;
  return result?.reason ?? result?.error ?? 'the motion was rejected';
}

/**
 * The line to speak, or null when there is nothing worth saying.
 *
 * A deterministic command that simply executed returns null: the arm moving is
 * its own feedback, and narrating every jog makes the console unusable.
 */
export function describeOutcome(outcome: VoiceOutcome): string | null {
  const agent = outcome.agentResult;

  if (agent) {
    // Ambiguous instruction — ask, never guess.
    if (agent.clarifyingQuestion) return sentence(agent.clarifyingQuestion);

    // Planner or safety preflight refused the instruction.
    if (agent.failureReason) return join(agent.confirmation, humanizeVoiceError(agent.failureReason));

    // Planned fine, but never dispatched (stale pose, previous command in flight).
    if (outcome.skipped) return join(agent.confirmation, humanizeVoiceError(outcome.skipped));

    if (outcome.result) {
      return outcome.result.ok
        ? join(agent.confirmation, 'That is done')
        : join(agent.confirmation, humanizeVoiceError(whyItFailed(outcome)));
    }

    return sentence(agent.confirmation) || null;
  }

  // Deterministic path: speak up only when the command did not run.
  if (outcome.skipped) return sentence(humanizeVoiceError(outcome.skipped));
  if (outcome.result && !outcome.result.ok) return sentence(humanizeVoiceError(whyItFailed(outcome)));

  return null;
}

/** Speak `text` aloud. No-op under SSR or in browsers without the Web Speech API. */
export function speak(text: string): void {
  if (typeof window === 'undefined') return;
  const synth = window.speechSynthesis;
  if (!synth || !text) return;

  // A new command supersedes whatever is still being narrated.
  synth.cancel();
  synth.speak(new SpeechSynthesisUtterance(text));
}
