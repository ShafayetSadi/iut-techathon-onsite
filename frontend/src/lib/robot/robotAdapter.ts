/**
 * robotAdapter.ts — the bridge between the authoritative store and the URDF.
 *
 * The robot object is a *renderer* of `jointAngles`. `applyJoints` pushes store
 * angles onto the robot; `forwardKinematics` reads the resulting stylus-tip pose
 * back out. Because the whole scene is rendered in the base frame (world ==
 * base_link, Z-up), the tip's world position IS its base-frame position — no
 * conversion, which is the mitigation for the coordinate-frame risk.
 */

import { Vector3 } from 'three';
import type { URDFRobot } from 'urdf-loader';
import { EE_LINK_NAME, JOINT_NAMES } from '@/config/robot.config';
import type { Vec3 } from '@/lib/motion/commands';

const _tip = new Vector3();

/** Push the store's joint-angle array onto the URDF robot (by canonical order). */
export function applyJoints(robot: URDFRobot, angles: number[]): void {
  for (let i = 0; i < JOINT_NAMES.length; i += 1) {
    const name = JOINT_NAMES[i];
    const value = angles[i] ?? 0;
    robot.setJointValue(name, value);
  }
}

/**
 * Forward kinematics: world (== base-frame) position of the stylus tip.
 * Call `robot.updateMatrixWorld(true)` before this (the render loop does).
 */
export function forwardKinematics(robot: URDFRobot): Vec3 {
  const link = robot.links[EE_LINK_NAME];
  if (!link) {
    return { x: 0, y: 0, z: 0 };
  }
  link.getWorldPosition(_tip);
  return { x: _tip.x, y: _tip.y, z: _tip.z };
}
