/**
 * commands.ts — the shared cross-team contracts.
 *
 * "One motion pipeline, five triggers." Every trigger (dashboard, joystick,
 * keyboard, voice, autonomous PIN, agentic layer) produces a `MotionCommand`;
 * nothing touches joints directly. Every command returns a `MotionResult`.
 *
 * These types are the interface the whole app codes against — keep them stable.
 */

export type Vec3 = { x: number; y: number; z: number };

/** The ONE thing all five triggers produce. */
export type MotionCommand =
  | { type: 'jog_cartesian'; delta: Vec3; frame?: 'world' | 'tool'; continuous?: boolean; requestedStepMm?: number }
  | { type: 'move_to'; target: Vec3; approach?: Vec3 } // IK targeting + PIN
  | { type: 'set_joint'; joint: number; value: number } // absolute radians
  | { type: 'jog_joint'; joint: number; delta: number } // e.g. "rotate base 30°"
  | { type: 'touch_key'; key: string } // resolves via key.config.json
  | { type: 'enter_pin'; pin: string } // autonomous 6-digit panel entry
  | { type: 'sequence'; steps: MotionCommand[] } // PIN entry
  | { type: 'home' }
  | { type: 'stop' };

export type MotionErrorCode =
  | 'unreachable'
  | 'joint_limit'
  | 'workspace_bounds'
  | 'malformed'
  | 'cancelled';

/** What every command returns. Voice/agentic feedback + PIN success read this. */
export interface MotionResult {
  commandId: string;
  ok: boolean;
  reachedTarget?: boolean; // within tolerance (±5mm for touch)
  finalJoints?: number[];
  finalEE?: Vec3;
  error?: MotionErrorCode;
  reason?: string; // human-readable, for spoken/agentic feedback
}

/** Result of the deterministic safety gate in validate.ts. */
export type ValidationResult =
  | { ok: true }
  | { ok: false; error: MotionErrorCode; reason: string };

let _idCounter = 0;
/** Monotonic command id, prefixed so logs are readable. */
export function nextCommandId(prefix = 'cmd'): string {
  _idCounter += 1;
  return `${prefix}-${_idCounter}`;
}
