/**
 * matcher.ts — resolve a spoken transcript into a MotionCommand.
 *
 * Pipeline: normalize → skeletonize → score every template → decide.
 *
 * The decision has three outcomes, and the third one is the point. A near-tie
 * between two templates is not a match to be guessed at, it is a question to be
 * asked. Phase 3B is scored on asking rather than guessing, so the margin check
 * lives here where both the deterministic mapper and any future reasoning layer
 * inherit it.
 *
 * See docs/phase3-frontend-brief.md §2.
 */

import { validateCommand } from '@/lib/motion/validate';
import type { MotionCommand } from '@/lib/motion/commands';
import { TEMPLATES, type Template } from './grammar';
import { ratio } from './levenshtein';
import { normalize, skeletonize } from './normalize';

/** A transcript must score at least this against a template to resolve. */
export const MATCH_THRESHOLD = 0.9;

/** If the runner-up is this close to the winner, we refuse to guess. */
export const AMBIGUITY_MARGIN = 0.05;

/**
 * `stop` is matched separately, before scoring, at a far looser threshold.
 * A stop that fails to register because the mic clipped a phoneme is the one
 * failure in this grammar with real consequences; a spurious stop is harmless.
 */
export const STOP_THRESHOLD = 0.6;

export interface TemplateMatch {
  template: string;
  confidence: number;
}

export interface Resolution {
  status: 'matched' | 'ambiguous' | 'unmatched';
  /** The normalized text the matcher actually scored. */
  normalized: string;
  command?: MotionCommand;
  template?: string;
  confidence?: number;
  /** Populated when `status` is `ambiguous`. */
  alternatives?: TemplateMatch[];
  /** Why nothing resolved, when `status` is `unmatched`. */
  reason?: string;
  /** Verdict from the deterministic safety gate. Present whenever matched. */
  gate?: { ok: boolean; reason?: string };
}

function isStop(normalized: string): boolean {
  return normalized.split(' ').some((token) => ratio(token, 'stop') >= STOP_THRESHOLD);
}

function gateFor(command: MotionCommand): Resolution['gate'] {
  const result = validateCommand(command);
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/** `templates` is injectable so tests can exercise the decision rules in isolation. */
export function matchTranscript(raw: string, templates: Template[] = TEMPLATES): Resolution {
  const normalized = normalize(raw);

  if (!normalized) {
    return { status: 'unmatched', normalized, reason: 'Nothing was said.' };
  }

  if (isStop(normalized)) {
    const command: MotionCommand = { type: 'stop' };
    return {
      status: 'matched',
      normalized,
      command,
      template: 'stop',
      confidence: 1,
      gate: gateFor(command),
    };
  }

  const { skeleton, params } = skeletonize(normalized);

  const scored = templates.map((template) => ({
    template,
    confidence: ratio(skeleton, template.skeleton),
  })).sort((a, b) => b.confidence - a.confidence);

  const best = scored[0];
  const runnerUp = scored[1];

  if (!best || best.confidence < MATCH_THRESHOLD) {
    return {
      status: 'unmatched',
      normalized,
      reason: `No command matched "${normalized}".`,
      alternatives: best ? [{ template: best.template.skeleton, confidence: best.confidence }] : [],
    };
  }

  if (runnerUp && best.confidence - runnerUp.confidence < AMBIGUITY_MARGIN) {
    return {
      status: 'ambiguous',
      normalized,
      reason: 'That could mean more than one thing.',
      alternatives: [best, runnerUp].map((entry) => ({
        template: entry.template.skeleton,
        confidence: entry.confidence,
      })),
    };
  }

  const command = best.template.build(params);
  if (!command) {
    const domain = best.template.domain ? ` — ${best.template.domain}` : '';
    return {
      status: 'unmatched',
      normalized,
      reason: `Understood "${best.template.skeleton}" but the value is out of range${domain}.`,
    };
  }

  return {
    status: 'matched',
    normalized,
    command,
    template: best.template.skeleton,
    confidence: best.confidence,
    gate: gateFor(command),
  };
}

/** Human-readable one-liner for a resolved command. Used by the transcript UI. */
export function describeCommand(command: MotionCommand): string {
  switch (command.type) {
    case 'jog_cartesian': {
      const { x, y, z } = command.delta;
      const parts = ([['x', x], ['y', y], ['z', z]] as const)
        .filter(([, value]) => Math.abs(value) > 1e-9)
        .map(([axis, value]) => `${axis} ${value > 0 ? '+' : ''}${(value * 1000).toFixed(0)} mm`);
      return `jog_cartesian ${parts.join(' ') || 'no motion'}`;
    }
    case 'jog_joint':
      return `jog_joint J${command.joint + 1} ${((command.delta * 180) / Math.PI).toFixed(1)}°`;
    case 'set_joint':
      return `set_joint J${command.joint + 1} → ${((command.value * 180) / Math.PI).toFixed(1)}°`;
    case 'touch_key':
      return `touch_key ${command.key}`;
    case 'move_to':
      return `move_to (${command.target.x}, ${command.target.y}, ${command.target.z})`;
    case 'sequence':
      return `sequence of ${command.steps.length}`;
    default:
      return command.type;
  }
}
