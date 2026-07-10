/**
 * robot.config.ts — Ground truth about the provided `stylus_arm` URDF.
 *
 * Filled in after inspecting `6_dof_arm.urdf`. Everything downstream (dashboard,
 * IK, panel placement, PIN entry) reads these constants instead of re-parsing
 * the URDF, so there is exactly one place to update if the model changes.
 *
 * Frame note: the URDF is authored Z-up (joint_1 yaws about +Z, links extend
 * along +Z). We render the whole scene *in the base frame* (world = base_link),
 * so panel coordinates from key.config.json and forward-kinematics results are
 * directly comparable with no frame conversion. See RobotScene for the Z-up
 * world setup. This is the mitigation for "Risk A — coordinate frames".
 */

export const URDF_URL = '/urdf/6_dof_arm.urdf';
export const KEY_CONFIG_URL = '/config/key.config.json';

/** URDF is in meters; key.config.json is in meters. No unit conversion needed. */
export const UNITS = 'meters' as const;

/** Link whose origin is the stylus tip / TCP — used for forward kinematics. */
export const EE_LINK_NAME = 'stylus_tip';

/** Base link name (world == base frame). */
export const BASE_LINK_NAME = 'base_link';

export interface JointSpec {
  /** Name exactly as it appears in the URDF. */
  name: string;
  /** Human-friendly label for the dashboard. */
  label: string;
  /** Rotation axis in the joint's local frame (unit vector). */
  axis: [number, number, number];
  /** Joint position limits in radians [lower, upper]. */
  limit: [number, number];
}

/**
 * Canonical joint order. The store's `jointAngles` array is indexed by this
 * order, so index 0 === joint_1, index 6 === stylus_pitch. 7 actuated joints:
 * 6 for the arm + 1 stylus pitch. The stylus_tip_frame joint is fixed and not
 * listed (not actuated).
 */
export const JOINTS: JointSpec[] = [
  { name: 'joint_1', label: 'J1 · base yaw', axis: [0, 0, 1], limit: [-3.1416, 3.1416] },
  { name: 'joint_2', label: 'J2 · shoulder', axis: [0, 1, 0], limit: [-2.0944, 2.0944] },
  { name: 'joint_3', label: 'J3 · elbow', axis: [0, 1, 0], limit: [-2.618, 2.618] },
  { name: 'joint_4', label: 'J4 · forearm roll', axis: [0, 0, 1], limit: [-3.1416, 3.1416] },
  { name: 'joint_5', label: 'J5 · wrist pitch', axis: [0, 1, 0], limit: [-2.0944, 2.0944] },
  { name: 'joint_6', label: 'J6 · tool roll', axis: [0, 0, 1], limit: [-3.1416, 3.1416] },
  { name: 'stylus_pitch', label: 'J7 · stylus pitch', axis: [0, 1, 0], limit: [-2.0944, 2.0944] },
];

export const JOINT_NAMES: string[] = JOINTS.map((j) => j.name);
export const JOINT_LIMITS: [number, number][] = JOINTS.map((j) => j.limit);
export const NUM_JOINTS = JOINTS.length;

/** name -> index into the jointAngles array. */
export const JOINT_INDEX: Record<string, number> = Object.fromEntries(
  JOINTS.map((j, i) => [j.name, i]),
);

/** Reach-and-touch tolerance for a successful key press (Phase 4): ±5 mm. */
export const TOUCH_TOLERANCE_M = 0.005;

/**
 * Rough reachable radius of the stylus tip from the base, in meters. Sum of the
 * link lengths (0.25*4 + 0.15*2 + stylus ~0.263). Used by the workspace-bounds
 * safety check as a coarse, deterministic sanity gate before IK runs.
 */
export const MAX_REACH_M = 1.3;
