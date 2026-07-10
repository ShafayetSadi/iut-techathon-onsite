/**
 * keyConfig.ts — load + type the provided key.config.json (the 6-key test panel).
 *
 * Coordinates are in the arm's base frame, in meters, with `approach_axis`
 * telling us which way the stylus comes down to touch a key (-z = straight down
 * in base frame). We render each key at its coordinate and, in Phase 4, drive
 * the tip to it within ±5 mm.
 */

import { KEY_CONFIG_URL } from '@/config/robot.config';
import type { Vec3 } from '@/lib/motion/commands';

export interface KeyConfig {
  frame: string;
  units: string;
  approach_axis: string;
  keys: Record<string, { x: number; y: number; z: number }>;
}

export interface PanelKey {
  label: string; // "1".."6"
  position: Vec3; // base-frame meters
}

export async function loadKeyConfig(url: string = KEY_CONFIG_URL): Promise<KeyConfig> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to load key config (${res.status})`);
  }
  return (await res.json()) as KeyConfig;
}

export function toPanelKeys(cfg: KeyConfig): PanelKey[] {
  return Object.entries(cfg.keys)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([label, p]) => ({ label, position: { x: p.x, y: p.y, z: p.z } }));
}

/** Unit approach direction (base frame) from `approach_axis`, e.g. "-z". */
export function approachVector(cfg: KeyConfig): Vec3 {
  const s = cfg.approach_axis.trim().toLowerCase();
  const sign = s.startsWith('-') ? -1 : 1;
  const axis = s.replace(/[+-]/, '');
  return {
    x: axis === 'x' ? sign : 0,
    y: axis === 'y' ? sign : 0,
    z: axis === 'z' ? sign : 0,
  };
}
