/**
 * grammar.ts — the spoken command vocabulary. Data only, no logic.
 *
 * Every template is a *skeleton* (see normalize.ts) paired with a builder that
 * turns the captured numbers into a MotionCommand. The MotionCommand union is
 * the single contract every trigger produces, so voice gets the same
 * deterministic safety gate as the joystick and the keyboard for free.
 *
 * See docs/phase3-frontend-brief.md §1–§2.
 */

import { JOINTS } from '@/config/robot.config';
import type { MotionCommand, Vec3 } from '@/lib/motion/commands';

/**
 * Frame convention (robot-centric, ROS REP-103): +x forward toward the test
 * panel, +y left, +z up. The scene is rendered in the base frame, so these are
 * world coordinates with no conversion.
 *
 * NOTE: this deliberately differs from KeyboardJog's AXIS_KEYS, which uses a
 * top-down map metaphor (ArrowUp = +y). Spoken "up" means vertical; a spoken
 * "forward" must approach the panel, which pins forward to +x and therefore
 * left/right to y. Reconciling the two is tracked in the phase-3 brief.
 */
export const DIRECTIONS: Record<string, Vec3> = {
  up: { x: 0, y: 0, z: 1 },
  down: { x: 0, y: 0, z: -1 },
  left: { x: 0, y: 1, z: 0 },
  right: { x: 0, y: -1, z: 0 },
  forward: { x: 1, y: 0, z: 0 },
  back: { x: -1, y: 0, z: 0 },
};

/**
 * Step for a bare "move up" with no distance given.
 *
 * Deliberately NOT the 0.25 m constant the XYZ buttons use: a button click is a
 * coarse deliberate nudge, while a spoken command should land somewhere an
 * operator can still see and correct.
 */
export const DEFAULT_STEP_M = 0.02;

export const LENGTH_UNITS: Record<string, number> = {
  millimeters: 0.001,
  centimeters: 0.01,
  meters: 1,
};

/** Digits present on the test panel (key.config.json defines exactly these). */
export const PANEL_KEYS = ['1', '2', '3', '4', '5', '6'];

const DEG_TO_RAD = Math.PI / 180;

export interface JointVocab {
  /** Index into the store's jointAngles array. */
  index: number;
  /** Spoken name. */
  word: string;
  /** Extra normalized names the operator may say for the same joint. */
  aliases: string[];
  /** Direction word meaning a POSITIVE joint delta. */
  positive: string;
  /** Direction word meaning a NEGATIVE joint delta. */
  negative: string;
}

/** Spoken name per joint, in canonical JOINTS order. */
const SPOKEN_NAMES = ['base', 'shoulder', 'elbow', 'forearm', 'wrist', 'tool', 'stylus'];
const SPOKEN_ALIASES = [
  ['base yaw'],
  ['shoulder pitch'],
  ['elbow pitch'],
  ['forearm roll'],
  ['wrist pitch'],
  ['tool roll'],
  ['stylus pitch'],
];

/**
 * Derived from JOINTS so the two can never drift.
 *
 * Sign is read per-joint, never assumed globally. A rotation about +z carries
 * +x toward +y, so for a yaw joint "left" is positive. A rotation about +y
 * carries +z toward +x, tipping the arm forward and down — so for a pitch joint
 * "down" is positive and "up" is negative.
 */
export const JOINT_VOCAB: JointVocab[] = JOINTS.map((joint, index) => {
  const isYaw = joint.axis[2] === 1;
  return {
    index,
    word: SPOKEN_NAMES[index],
    aliases: SPOKEN_ALIASES[index] ?? [],
    positive: isYaw ? 'left' : 'down',
    negative: isYaw ? 'right' : 'up',
  };
});

export interface Template {
  /** Normalized skeleton the matcher scores against. */
  skeleton: string;
  /** `null` means the utterance matched but its arguments are out of domain. */
  build: (params: number[]) => MotionCommand | null;
  /** Shown to the operator when the params are rejected. */
  domain?: string;
}

function scaled(direction: Vec3, meters: number): MotionCommand {
  return {
    type: 'jog_cartesian',
    delta: { x: direction.x * meters, y: direction.y * meters, z: direction.z * meters },
    frame: 'world',
  };
}

function finite(params: number[], count: number): boolean {
  return params.length >= count && params.slice(0, count).every(Number.isFinite);
}

function jointIndexFromSpokenNumber(value: number): number | null {
  if (!Number.isInteger(value) || value < 1 || value > JOINTS.length) return null;
  return value - 1;
}

function addJointTemplates(templates: Template[], joint: JointVocab, name: string): void {
  templates.push({
    skeleton: `rotate ${name} {n} degrees`,
    build: (params) =>
      finite(params, 1)
        ? { type: 'jog_joint', joint: joint.index, delta: params[0] * DEG_TO_RAD }
        : null,
  });

  templates.push({
    skeleton: `rotate ${name} to {n} degrees`,
    build: (params) =>
      finite(params, 1)
        ? { type: 'set_joint', joint: joint.index, value: params[0] * DEG_TO_RAD }
        : null,
  });

  for (const [word, sign] of [
    [joint.positive, 1],
    [joint.negative, -1],
  ] as const) {
    templates.push({
      skeleton: `rotate ${name} ${word} {n} degrees`,
      build: (params) =>
        finite(params, 1)
          ? { type: 'jog_joint', joint: joint.index, delta: sign * params[0] * DEG_TO_RAD }
          : null,
    });
  }

  templates.push({
    skeleton: `set ${name} to {n} degrees`,
    build: (params) =>
      finite(params, 1)
        ? { type: 'set_joint', joint: joint.index, value: params[0] * DEG_TO_RAD }
        : null,
  });

  templates.push({
    skeleton: `center ${name}`,
    build: () => ({ type: 'set_joint', joint: joint.index, value: 0 }),
  });
}

function addNumberedJointTemplates(templates: Template[], prefix: 'j' | 'j ' | 'joint '): void {
  templates.push({
    skeleton: `rotate ${prefix}{n} {n} degrees`,
    build: (params) => {
      if (!finite(params, 2)) return null;
      const joint = jointIndexFromSpokenNumber(params[0]);
      return joint == null ? null : { type: 'jog_joint', joint, delta: params[1] * DEG_TO_RAD };
    },
    domain: `joint number must be 1 to ${JOINTS.length}`,
  });

  templates.push({
    skeleton: `rotate ${prefix}{n} to {n} degrees`,
    build: (params) => {
      if (!finite(params, 2)) return null;
      const joint = jointIndexFromSpokenNumber(params[0]);
      return joint == null ? null : { type: 'set_joint', joint, value: params[1] * DEG_TO_RAD };
    },
    domain: `joint number must be 1 to ${JOINTS.length}`,
  });

  templates.push({
    skeleton: `set ${prefix}{n} to {n} degrees`,
    build: (params) => {
      if (!finite(params, 2)) return null;
      const joint = jointIndexFromSpokenNumber(params[0]);
      return joint == null ? null : { type: 'set_joint', joint, value: params[1] * DEG_TO_RAD };
    },
    domain: `joint number must be 1 to ${JOINTS.length}`,
  });
}

function buildTemplates(): Template[] {
  const templates: Template[] = [];

  for (const [word, direction] of Object.entries(DIRECTIONS)) {
    templates.push({
      skeleton: `move ${word}`,
      build: () => scaled(direction, DEFAULT_STEP_M),
    });

    // A bare number after a move is centimeters: "move up 5".
    templates.push({
      skeleton: `move ${word} {n}`,
      build: (params) => (finite(params, 1) ? scaled(direction, params[0] * 0.01) : null),
    });

    for (const [unit, meters] of Object.entries(LENGTH_UNITS)) {
      templates.push({
        skeleton: `move ${word} {n} ${unit}`,
        build: (params) => (finite(params, 1) ? scaled(direction, params[0] * meters) : null),
      });
    }
  }

  for (const joint of JOINT_VOCAB) {
    for (const name of [joint.word, ...joint.aliases]) {
      addJointTemplates(templates, joint, name);
    }
  }

  addNumberedJointTemplates(templates, 'j');
  addNumberedJointTemplates(templates, 'joint ');

  const touchKey = (params: number[]): MotionCommand | null => {
    if (!finite(params, 1)) return null;
    const key = String(params[0]);
    return PANEL_KEYS.includes(key) ? { type: 'touch_key', key } : null;
  };

  const touchKeyRepeated = (params: number[]): MotionCommand | null => {
    if (!finite(params, 2)) return null;
    const key = String(params[0]);
    const repeat = params[1];
    if (!PANEL_KEYS.includes(key) || !Number.isInteger(repeat) || repeat < 1 || repeat > 6) return null;
    return { type: 'sequence', steps: Array.from({ length: repeat }, () => ({ type: 'touch_key', key })) };
  };

  templates.push({ skeleton: 'press key {n}', build: touchKey, domain: 'the panel has keys 1 to 6' });
  templates.push({ skeleton: 'press {n}', build: touchKey, domain: 'the panel has keys 1 to 6' });
  templates.push({
    skeleton: 'press key {n} {n} times',
    build: touchKeyRepeated,
    domain: 'the panel has keys 1 to 6 and repeat count must be 1 to 6',
  });
  templates.push({
    skeleton: 'press {n} {n} times',
    build: touchKeyRepeated,
    domain: 'the panel has keys 1 to 6 and repeat count must be 1 to 6',
  });

  templates.push({ skeleton: 'home', build: () => ({ type: 'home' }) });

  // `stop` is intentionally absent: the matcher short-circuits on it before any
  // scoring happens, so it can never be lost to a threshold. See matcher.ts.

  return templates;
}

export const TEMPLATES: Template[] = buildTemplates();
