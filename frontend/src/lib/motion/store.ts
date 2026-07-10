/**
 * store.ts — the single source of truth (Zustand).
 *
 * `jointAngles` is the ONLY authoritative arm state. The URDF robot object is a
 * *renderer* of this truth, never an independent holder. The Three.js render
 * loop reads `jointAngles` each frame, pushes them onto the robot, computes the
 * end-effector via forward kinematics, and writes `eePosition` back here.
 *
 * The render loop uses `getState()` / `setState()` directly (outside React), so
 * pushing joint updates 60x/sec never triggers a React re-render storm. Only the
 * dashboard components subscribe via hooks and re-render when values change.
 */

import { create } from 'zustand';
import {
  JOINT_LIMITS,
  JOINT_NAMES,
  NUM_JOINTS,
} from '@/config/robot.config';
import {
  nextCommandId,
  type MotionCommand,
  type MotionResult,
  type Vec3,
} from './commands';
import { validateCommand } from './validate';
import {
  getPanelKeyPosition,
  jogCartesian,
  jointMapToArray,
  solveIk,
  type IkResponse,
} from './backendApi';

export type Mode = 'idle' | 'jog' | 'voice' | 'auto';
export type Status = 'ready' | 'moving' | 'error';
export type LogLevel = 'info' | 'ok' | 'error';

export interface LogEntry {
  t: number;
  text: string;
  level: LogLevel;
}

const IGNORE_LIMIT = 2 * Math.PI; // widened bound when limits are ignored

function clampToLimit(index: number, value: number, ignore: boolean): number {
  const [lo, hi] = ignore ? [-IGNORE_LIMIT, IGNORE_LIMIT] : JOINT_LIMITS[index];
  return Math.min(hi, Math.max(lo, value));
}

export interface MotionState {
  // ── authoritative state ──────────────────────────────────────────────
  jointAngles: number[]; // radians, indexed by robot.config JOINTS order
  jointLimits: [number, number][];
  jointNames: string[];
  eePosition: Vec3; // computed via FK each frame (base frame, meters)
  target: Vec3 | null;
  mode: Mode;
  status: Status;
  log: LogEntry[];
  robotReady: boolean;
  continuousJogActive: boolean;
  /**
   * Interactive affordance: loosen manual jogging past URDF limits. The
   * deterministic safety gate in validate.ts still enforces limits on every
   * *dispatched* command regardless of this flag.
   */
  ignoreLimits: boolean;

  // ── high-level entry point (all five triggers funnel through here) ───
  dispatch: (cmd: MotionCommand) => Promise<MotionResult>;
  applyIkResponse: (
    commandId: string,
    response: IkResponse,
    successLog: string,
    options?: { animateTrajectory?: boolean },
  ) => Promise<MotionResult>;

  // ── low-level setters used by the render loop / UI ───────────────────
  setJoints: (angles: number[]) => void;
  setJoint: (index: number, value: number) => void;
  setJointByName: (name: string, value: number) => void;
  jogJoint: (index: number, delta: number) => void;
  home: () => void;
  setEEPosition: (p: Vec3) => void;
  setTarget: (p: Vec3 | null) => void;
  setMode: (mode: Mode) => void;
  setStatus: (status: Status) => void;
  beginContinuousJog: () => void;
  endContinuousJog: () => void;
  setRobotReady: (ready: boolean) => void;
  setIgnoreLimits: (ignore: boolean) => void;
  pushLog: (text: string, level?: LogLevel) => void;
  clearLog: () => void;
}

const MAX_LOG = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function errorCodeFromReason(reason: string | undefined): MotionResult['error'] {
  const text = reason?.toLowerCase() ?? '';
  if (text.includes('workspace')) return 'workspace_bounds';
  if (text.includes('limit')) return 'joint_limit';
  if (text.includes('malformed') || text.includes('invalid')) return 'malformed';
  return 'unreachable';
}

export const useMotionStore = create<MotionState>((set, get) => ({
  jointAngles: new Array(NUM_JOINTS).fill(0),
  jointLimits: JOINT_LIMITS,
  jointNames: JOINT_NAMES,
  eePosition: { x: 0, y: 0, z: 0 },
  target: null,
  mode: 'idle',
  status: 'ready',
  log: [{ t: Date.now(), text: 'System initialized. Awaiting URDF…', level: 'info' }],
  robotReady: false,
  continuousJogActive: false,
  ignoreLimits: false,

  dispatch: async (cmd) => {
    const commandId = nextCommandId();
    const gate = validateCommand(cmd);
    if (!gate.ok) {
      get().pushLog(`Rejected ${cmd.type}: ${gate.reason}`, 'error');
      set({ status: 'error', continuousJogActive: false });
      return { commandId, ok: false, error: gate.error, reason: gate.reason };
    }

    try {
      switch (cmd.type) {
      case 'set_joint': {
        get().setJoint(cmd.joint, cmd.value);
        break;
      }
      case 'jog_joint': {
        get().jogJoint(cmd.joint, cmd.delta);
        break;
      }
      case 'home': {
        get().home();
        break;
      }
      case 'stop': {
        set({ status: 'ready', mode: 'idle', continuousJogActive: false });
        break;
      }
      case 'move_to': {
        set({ mode: 'jog', status: 'moving', target: cmd.target });
        const response = await solveIk(cmd.target, get().jointAngles);
        return await get().applyIkResponse(commandId, response, 'IK target reached.');
      }
      case 'jog_cartesian': {
        set({ mode: 'jog', status: 'moving' });
        const response = await jogCartesian(cmd.delta, get().jointAngles);
        const mag = Math.hypot(cmd.delta.x, cmd.delta.y, cmd.delta.z) * 1000;
        return await get().applyIkResponse(commandId, response, `Jogged ${mag.toFixed(1)} mm.`, {
          animateTrajectory: cmd.continuous !== true,
        });
      }
      case 'touch_key': {
        const target = await getPanelKeyPosition(cmd.key);
        set({ mode: 'auto', status: 'moving', target });
        const response = await solveIk(target, get().jointAngles);
        return await get().applyIkResponse(commandId, response, `Touched key ${cmd.key}.`);
      }
      case 'sequence': {
        set({ mode: 'auto', status: 'moving' });
        for (const step of cmd.steps) {
          const result = await get().dispatch(step);
          if (!result.ok) return result;
        }
        set({ status: 'ready' });
        return {
          commandId,
          ok: true,
          finalJoints: [...get().jointAngles],
          finalEE: { ...get().eePosition },
        };
      }
      default: {
        const reason = 'Motion command is not implemented yet.';
        get().pushLog(reason, 'error');
        set({ status: 'error', continuousJogActive: false });
        return { commandId, ok: false, error: 'unreachable', reason };
      }
      }
    } catch (err) {
      const reason = (err as Error).message || 'Backend motion command failed.';
      get().pushLog(reason, 'error');
      set({ status: 'error', continuousJogActive: false });
      return { commandId, ok: false, error: errorCodeFromReason(reason), reason };
    }

    const { jointAngles, eePosition } = get();
    return {
      commandId,
      ok: true,
      finalJoints: [...jointAngles],
      finalEE: { ...eePosition },
    };
  },

  setJoints: (angles) => {
    const ignore = get().ignoreLimits;
    const next = angles
      .slice(0, NUM_JOINTS)
      .map((a, i) => clampToLimit(i, a, ignore));
    set({ jointAngles: next });
  },

  applyIkResponse: async (
    commandId: string,
    response: IkResponse,
    successLog: string,
    options = {},
  ) => {
    if (!response.success || !response.joints) {
      const reason = response.reason || 'Backend IK solver could not reach the target.';
      get().pushLog(reason, 'error');
      set({ status: 'error', continuousJogActive: false });
      return { commandId, ok: false, error: errorCodeFromReason(reason), reason };
    }

    const trajectory = options.animateTrajectory === false ? [] : response.trajectory ?? [];
    for (const point of trajectory) {
      get().setJoints(jointMapToArray(point.joints));
      if (trajectory.length > 1) await sleep(20);
    }
    get().setJoints(jointMapToArray(response.joints));
    if (response.tip) get().setEEPosition(response.tip);
    if (!get().continuousJogActive) {
      set({ status: 'ready' });
    }

    const errorMm = response.errorMeters == null ? '' : ` error ${(response.errorMeters * 1000).toFixed(1)} mm`;
    get().pushLog(`${successLog}${errorMm}`, 'ok');
    return {
      commandId,
      ok: true,
      reachedTarget: response.errorMeters == null ? undefined : response.errorMeters <= 0.005,
      finalJoints: jointMapToArray(response.joints),
      finalEE: response.tip,
    };
  },

  setJoint: (index, value) => {
    if (index < 0 || index >= NUM_JOINTS) return;
    const next = [...get().jointAngles];
    next[index] = clampToLimit(index, value, get().ignoreLimits);
    set({ jointAngles: next });
  },

  setJointByName: (name, value) => {
    const index = JOINT_NAMES.indexOf(name);
    if (index === -1) return;
    get().setJoint(index, value);
  },

  jogJoint: (index, delta) => {
    if (index < 0 || index >= NUM_JOINTS) return;
    get().setJoint(index, get().jointAngles[index] + delta);
  },

  home: () => {
    set({ jointAngles: new Array(NUM_JOINTS).fill(0), target: null });
    get().pushLog('Homed all joints to 0.', 'ok');
  },

  setEEPosition: (p) => {
    // Only write when it actually moved (>0.1 mm) to avoid needless re-renders.
    const cur = get().eePosition;
    if (
      Math.abs(cur.x - p.x) < 1e-4 &&
      Math.abs(cur.y - p.y) < 1e-4 &&
      Math.abs(cur.z - p.z) < 1e-4
    ) {
      return;
    }
    set({ eePosition: p });
  },

  setTarget: (p) => set({ target: p }),
  setMode: (mode) => set({ mode }),
  setStatus: (status) => set({ status }),
  beginContinuousJog: () => {
    set({ continuousJogActive: true, mode: 'jog', status: 'moving' });
  },
  endContinuousJog: () => {
    set((state) => ({
      continuousJogActive: false,
      mode: state.status === 'error' ? state.mode : 'idle',
      status: state.status === 'error' ? state.status : 'ready',
    }));
  },
  setRobotReady: (ready) => set({ robotReady: ready }),
  setIgnoreLimits: (ignore) => {
    set({ ignoreLimits: ignore });
    // Re-clamp current pose to the (possibly tighter) bounds.
    if (!ignore) get().setJoints(get().jointAngles);
  },

  pushLog: (text, level = 'info') => {
    const entry: LogEntry = { t: Date.now(), text, level };
    const log = [...get().log, entry];
    if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
    set({ log });
  },

  clearLog: () => set({ log: [] }),
}));
