/**
 * speak.ts — the agent talking back. See docs/problem_statement.md §5 (Phase 3B).
 *
 * The reasoning layer must confirm what it understood and then report the
 * outcome: succeeded, failed and why, or a clarifying question instead of a
 * guess. `describeOutcome` turns a `VoiceOutcome` into that sentence; `speak`
 * is the only part that touches the browser.
 */

import type { VoiceOutcome } from './execute';

/** Longest failure notice worth speaking before it stops being a notice. */
const MAX_SPOKEN_REASON = 160;

/** Ensure clauses join into speakable prose rather than running together. */
function sentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * A backend `failureReason` can be a multi-line provider or Pydantic dump.
 * VoiceChat shows it whole; speech gets the first line, capped at a word
 * boundary. Reading a stack trace aloud is worse than saying nothing useful.
 */
function concise(text: string): string {
  const firstLine = text.trim().split('\n')[0].trim();
  if (firstLine.length <= MAX_SPOKEN_REASON) return firstLine;
  const cut = firstLine.slice(0, MAX_SPOKEN_REASON);
  const boundary = cut.lastIndexOf(' ');
  return `${(boundary > 0 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
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
    if (agent.failureReason) return join(agent.confirmation, concise(agent.failureReason));

    // Planned fine, but never dispatched (stale pose, previous command in flight).
    if (outcome.skipped) return join(agent.confirmation, concise(outcome.skipped));

    if (outcome.result) {
      return outcome.result.ok
        ? join(agent.confirmation, 'That is done')
        : join(agent.confirmation, `That failed: ${concise(whyItFailed(outcome))}`);
    }

    return sentence(agent.confirmation) || null;
  }

  // Deterministic path: speak up only when the command did not run.
  if (outcome.skipped) return sentence(concise(outcome.skipped));
  if (outcome.result && !outcome.result.ok) return sentence(concise(whyItFailed(outcome)));

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
