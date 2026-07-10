import { JOINT_NAMES } from '@/config/robot.config';
import type { Vec3 } from './commands';

const DEFAULT_BACKEND_URL = 'http://localhost:8000';

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, '') || DEFAULT_BACKEND_URL;

export interface TrajectoryPoint {
  timeMs: number;
  joints: Record<string, number>;
  tip: Vec3;
}

export interface IkResponse {
  success: boolean;
  joints?: Record<string, number>;
  tip?: Vec3;
  errorMeters?: number;
  iterations?: number;
  trajectory?: TrajectoryPoint[];
  reason?: string;
}

interface PanelKeyResponse {
  digit: string;
  position: Vec3;
}

interface PanelKeysResponse {
  keys: PanelKeyResponse[];
}

export function jointArrayToMap(jointAngles: number[]): Record<string, number> {
  return Object.fromEntries(JOINT_NAMES.map((name, index) => [name, jointAngles[index] ?? 0]));
}

export function jointMapToArray(joints: Record<string, number>): number[] {
  return JOINT_NAMES.map((name) => joints[name] ?? 0);
}

export async function solveIk(target: Vec3, jointAngles: number[]): Promise<IkResponse> {
  const res = await fetch(`${BACKEND_URL}/api/ik/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      target,
      currentJoints: jointArrayToMap(jointAngles),
    }),
  });
  return parseBackendResponse(res);
}

export async function jogCartesian(
  delta: Vec3,
  jointAngles: number[],
): Promise<IkResponse> {
  const res = await fetch(`${BACKEND_URL}/api/motion/jog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      delta,
      currentJoints: jointArrayToMap(jointAngles),
    }),
  });
  return parseBackendResponse(res);
}

export async function getPanelKeyPosition(key: string): Promise<Vec3> {
  const res = await fetch(`${BACKEND_URL}/api/panel/keys`, { cache: 'no-store' });
  const payload = (await parseBackendResponse(res)) as PanelKeysResponse;
  const match = payload.keys.find((item) => item.digit === key);
  if (!match) throw new Error(`Panel key ${key} is not defined by the backend.`);
  return match.position;
}

async function parseBackendResponse<T = unknown>(res: Response): Promise<T> {
  const payload = (await res.json().catch(() => null)) as T & { reason?: string; detail?: string };
  if (!res.ok) {
    throw new Error(payload?.reason || payload?.detail || `Backend request failed (${res.status})`);
  }
  return payload;
}

