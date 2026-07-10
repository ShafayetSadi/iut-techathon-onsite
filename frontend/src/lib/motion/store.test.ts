import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NUM_JOINTS } from '@/config/robot.config';
import { jogResponseLog, jogSuccessLog, registerJogCanceller, tipDistanceMm, useMotionStore } from './store';
import * as backend from './backendApi';

vi.mock('./backendApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./backendApi')>();
  return {
    ...actual,
    jogCartesian: vi.fn(),
    solveIk: vi.fn(),
    getPanelKeyPosition: vi.fn(),
    runPinSequence: vi.fn(),
  };
});

function resetStore() {
  useMotionStore.setState({
    jointAngles: new Array(NUM_JOINTS).fill(0),
    eePosition: { x: 0, y: 0, z: 0 },
    target: null,
    mode: 'idle',
    status: 'ready',
    log: [],
    lastCommand: null,
    lastError: null,
    robotReady: true,
    continuousJogActive: false,
    stopEpoch: 0,
    activePin: null,
    pinProgress: [],
    pinSteps: [],
    autoError: null,
    autoRunId: 0,
    ignoreLimits: false,
    agentExecutionToken: null,
  });
  registerJogCanceller(null);
  vi.clearAllMocks();
}

describe('jog movement log helpers', () => {
  it('measures actual tip displacement in millimeters', () => {
    const before = { x: -0.026, y: -0.004, z: 1.494 };
    const after = { x: -0.0212, y: -0.004, z: 1.494 };

    expect(tipDistanceMm(before, after)).toBeCloseTo(4.8, 8);
  });

  it('formats actual movement instead of requested movement', () => {
    expect(jogSuccessLog(0)).toBe('Jogged 0.0 mm.');
    expect(jogSuccessLog(4.8)).toBe('Jogged 4.8 mm.');
  });

  it('includes the requested step size when provided', () => {
    expect(jogSuccessLog(9.9, 10)).toBe('Jogged 9.9 mm / requested 10 mm.');
  });

  it('does not invent movement when the backend omits a tip', () => {
    expect(jogSuccessLog(null)).toBe('Jogged n/a mm.');
  });

  it('uses backend jog reasons for blocked movement', () => {
    expect(jogResponseLog({ reason: 'Jog blocked: requested direction is outside reach.' }, 0)).toBe(
      'Jog blocked: requested direction is outside reach.',
    );
  });
});

describe('motion store safety dispatch', () => {
  beforeEach(() => {
    resetStore();
  });

  it('rejects predicted workspace exits without calling the jog backend', async () => {
    useMotionStore.setState({ eePosition: { x: 1.65, y: 0, z: 0 } });

    const result = await useMotionStore.getState().dispatch({
      type: 'jog_cartesian',
      delta: { x: 0.1, y: 0, z: 0 },
      frame: 'world',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('workspace_bounds');
    expect(backend.jogCartesian).not.toHaveBeenCalled();
  });

  it('rejects joint jogs that would exceed URDF limits instead of clamping', async () => {
    const result = await useMotionStore.getState().dispatch({
      type: 'jog_joint',
      joint: 1,
      delta: 200 * (Math.PI / 180),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('joint_limit');
    expect(useMotionStore.getState().jointAngles[1]).toBe(0);
  });

  it('runs the registered continuous-jog canceller on stop', async () => {
    const cancel = vi.fn();
    registerJogCanceller(cancel);
    useMotionStore.setState({ continuousJogActive: true, mode: 'jog', status: 'moving' });

    const result = await useMotionStore.getState().dispatch({ type: 'stop' });

    expect(result.ok).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(useMotionStore.getState()).toMatchObject({
      continuousJogActive: false,
      mode: 'idle',
      status: 'ready',
      stopEpoch: 1,
      autoRunId: 1,
    });
  });

  it('does not write final IK joints after stop changes the epoch', async () => {
    vi.useFakeTimers();
    try {
      const state = useMotionStore.getState();
      const epoch = state.stopEpoch;
      const motion = state.applyIkResponse('cmd-test', {
        success: true,
        trajectory: [
          {
            timeMs: 0,
            joints: { joint_1: 0.25 },
            tip: { x: 0, y: 0, z: 0 },
          },
          {
            timeMs: 20,
            joints: { joint_1: 0.5 },
            tip: { x: 0, y: 0, z: 0 },
          },
        ],
        joints: { joint_1: 1 },
        tip: { x: 0.1, y: 0, z: 0 },
      }, 'IK target reached.', epoch);

      await Promise.resolve();
      expect(useMotionStore.getState().jointAngles[0]).toBe(0.25);

      await useMotionStore.getState().dispatch({ type: 'stop' });
      await vi.advanceTimersByTimeAsync(20);
      const result = await motion;

      expect(result).toMatchObject({ ok: false, error: 'cancelled' });
      expect(useMotionStore.getState().jointAngles[0]).toBe(0.25);
    } finally {
      vi.useRealTimers();
    }
  });

  it('blocks competing commands while an agent execution token owns the pipeline', async () => {
    const store = useMotionStore.getState();
    store.acquireAgentExecution('agent-test');

    const blocked = await useMotionStore.getState().dispatch({ type: 'home' });
    const allowed = await useMotionStore.getState().dispatch(
      { type: 'home' },
      { agentToken: 'agent-test' },
    );

    expect(blocked).toMatchObject({ ok: false, error: 'cancelled' });
    expect(allowed.ok).toBe(true);
    useMotionStore.getState().releaseAgentExecution('agent-test');
    expect(useMotionStore.getState().agentExecutionToken).toBeNull();
  });

  it('sends the ±5 mm touch tolerance for manual key presses', async () => {
    vi.mocked(backend.getPanelKeyPosition).mockResolvedValue({ x: 0.5, y: 0.05, z: 0.05 });
    vi.mocked(backend.solveIk).mockResolvedValue({
      success: true,
      joints: { joint_1: 0.1 },
      tip: { x: 0.5, y: 0.05, z: 0.05 },
      errorMeters: 0.004,
      trajectory: [],
    });

    const result = await useMotionStore.getState().dispatch({ type: 'touch_key', key: '1' });

    expect(result.ok).toBe(true);
    expect(backend.solveIk).toHaveBeenCalledWith(
      { x: 0.5, y: 0.05, z: 0.05 },
      expect.any(Array),
      { toleranceMeters: 0.005 },
    );
  });

  it('replays each PIN step trajectory once, without a duplicate retract', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(backend.runPinSequence).mockResolvedValue({
        success: true,
        pin: '111111',
        message: 'PIN 111111 planned successfully.',
        plannedDigits: ['1'],
        toleranceMeters: 0.005,
        approachOffsetMeters: 0.03,
        steps: [
          {
            index: 1,
            digit: '1',
            keyPosition: { x: 0.5, y: 0.05, z: 0.05 },
            approachTarget: { x: 0.5, y: 0.05, z: 0.08 },
            touchTarget: { x: 0.5, y: 0.05, z: 0.05 },
            retractTarget: { x: 0.5, y: 0.05, z: 0.08 },
            touchErrorMeters: 0.001,
            pressed: true,
            trajectory: [
              { timeMs: 0, joints: { joint_1: 0.1 }, tip: { x: 0, y: 0, z: 0 } },
              { timeMs: 0, joints: { joint_1: 0.2 }, tip: { x: 0, y: 0, z: 0 } },
              { timeMs: 0, joints: { joint_1: 0.3 }, tip: { x: 0, y: 0, z: 0 } },
            ],
            message: 'Pressed key 1: error 1.0mm',
          },
        ],
      });

      const motion = useMotionStore.getState().dispatch({ type: 'enter_pin', pin: '111111' });
      await vi.runAllTimersAsync();
      const result = await motion;

      expect(result.ok).toBe(true);
      expect(useMotionStore.getState().jointAngles[0]).toBe(0.3);
      expect(useMotionStore.getState().log.filter((entry) => entry.text === 'Retract key 1.')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
