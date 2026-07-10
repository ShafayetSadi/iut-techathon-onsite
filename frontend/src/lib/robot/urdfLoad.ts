/**
 * urdfLoad.ts — load + parse the URDF, return the THREE robot object.
 *
 * The provided `stylus_arm` URDF uses only primitive geometry (cylinders /
 * spheres), so there are no external mesh files to fetch and no `package://`
 * resolution or custom mesh loader is needed. urdf-loader builds the primitives
 * and applies the `<material><color>` values directly.
 */

import { LoadingManager } from 'three';
import URDFLoader, { type URDFRobot } from 'urdf-loader';
import { URDF_URL } from '@/config/robot.config';

export async function loadRobot(url: string = URDF_URL): Promise<URDFRobot> {
  const manager = new LoadingManager();
  const loader = new URDFLoader(manager);

  // Load both visual and collision geometry; collision is hidden by default and
  // toggled on from the viewer controls.
  loader.parseVisual = true;
  loader.parseCollision = true;

  const robot = await loader.loadAsync(url);

  // Nice-to-have: cast shadows from every mesh in the arm.
  robot.traverse((child) => {
    const anyChild = child as { isMesh?: boolean; castShadow?: boolean; receiveShadow?: boolean };
    if (anyChild.isMesh) {
      anyChild.castShadow = true;
      anyChild.receiveShadow = true;
    }
  });

  return robot;
}

/**
 * Log the joints + limits once after load, so `robot.config.ts` can be verified
 * against the actual parsed model during bring-up (task 2 of the brief).
 */
export function logRobotInfo(robot: URDFRobot): void {
  if (typeof window === 'undefined') return;
  const rows = Object.values(robot.joints).map((j) => ({
    name: j.name,
    type: j.jointType,
    axis: `${j.axis.x} ${j.axis.y} ${j.axis.z}`,
    lower: j.limit.lower,
    upper: j.limit.upper,
  }));
  // eslint-disable-next-line no-console
  console.table(rows);
}
