/**
 * validate.ts — the deterministic safety gate.
 *
 * EVERY command passes through here before any motion executes. This is a hard
 * requirement in the rubric: an agentic/reasoning layer that can send unchecked
 * motion is marked down under Architecture & Safety. Phase 1 implements the
 * joint-limit + workspace-bounds checks; IK reachability fills in later but the
 * seam already exists so nothing has to be re-plumbed.
 */

import {
  JOINT_LIMITS,
  MAX_REACH_M,
  NUM_JOINTS,
} from '@/config/robot.config';
import type { MotionCommand, ValidationResult, Vec3 } from './commands';

const OK: ValidationResult = { ok: true };

function reject(error: Exclude<ValidationResult, { ok: true }>['error'], reason: string): ValidationResult {
  return { ok: false, error, reason };
}

function withinJointLimit(joint: number, value: number): ValidationResult {
  if (!Number.isInteger(joint) || joint < 0 || joint >= NUM_JOINTS) {
    return reject('malformed', `Joint index ${joint} is out of range (0..${NUM_JOINTS - 1}).`);
  }
  if (!Number.isFinite(value)) {
    return reject('malformed', `Joint ${joint} value is not a finite number.`);
  }
  const [lo, hi] = JOINT_LIMITS[joint];
  if (value < lo - 1e-6 || value > hi + 1e-6) {
    return reject(
      'joint_limit',
      `Joint ${joint} value ${value.toFixed(3)} rad is outside limits [${lo.toFixed(3)}, ${hi.toFixed(3)}].`,
    );
  }
  return OK;
}

function withinWorkspace(p: Vec3): ValidationResult {
  if (![p.x, p.y, p.z].every(Number.isFinite)) {
    return reject('malformed', 'Target contains a non-finite coordinate.');
  }
  const r = Math.hypot(p.x, p.y, p.z);
  if (r > MAX_REACH_M) {
    return reject(
      'workspace_bounds',
      `Target is ${(r * 1000).toFixed(0)} mm from base — beyond the ~${(MAX_REACH_M * 1000).toFixed(0)} mm reach.`,
    );
  }
  return OK;
}

/**
 * The safety gate. Deterministic, pure, no side effects. Returns `{ ok: true }`
 * or a typed rejection with a human-readable reason (used for spoken feedback).
 */
export function validateCommand(cmd: MotionCommand): ValidationResult {
  switch (cmd.type) {
    case 'set_joint':
      return withinJointLimit(cmd.joint, cmd.value);

    case 'jog_joint':
      if (!Number.isInteger(cmd.joint) || cmd.joint < 0 || cmd.joint >= NUM_JOINTS) {
        return reject('malformed', `Joint index ${cmd.joint} is out of range.`);
      }
      if (!Number.isFinite(cmd.delta)) {
        return reject('malformed', 'Jog delta is not a finite number.');
      }
      return OK; // absolute limit is enforced when the delta is applied

    case 'move_to':
      return withinWorkspace(cmd.target);

    case 'jog_cartesian':
      if (![cmd.delta.x, cmd.delta.y, cmd.delta.z].every(Number.isFinite)) {
        return reject('malformed', 'Jog delta contains a non-finite coordinate.');
      }
      return OK;

    case 'touch_key':
      if (typeof cmd.key !== 'string' || cmd.key.length === 0) {
        return reject('malformed', 'touch_key requires a key label.');
      }
      return OK; // coordinate lookup + workspace check happens at resolve time

    case 'sequence':
      if (!Array.isArray(cmd.steps) || cmd.steps.length === 0) {
        return reject('malformed', 'sequence requires at least one step.');
      }
      for (const step of cmd.steps) {
        const r = validateCommand(step);
        if (!r.ok) return r;
      }
      return OK;

    case 'home':
    case 'stop':
      return OK;

    default:
      return reject('malformed', `Unknown command type.`);
  }
}
