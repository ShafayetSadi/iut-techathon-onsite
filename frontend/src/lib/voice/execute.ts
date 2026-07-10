import type { MotionCommand, MotionResult } from '@/lib/motion/commands';
import { useMotionStore } from '@/lib/motion/store';
import { JOINT_NAMES } from '@/config/robot.config';
import { interpretAgent, type AgentPendingPlan, type AgentResponse } from './agentApi';
import type { Resolution } from './matcher';

export type VoiceAction =
  | { kind: 'execute'; command: MotionCommand }
  | { kind: 'agent'; transcript: string; resolution: Resolution; pendingPlan?: AgentPendingPlan }
  | { kind: 'skip'; reason: string };

export interface VoiceOutcome {
  result?: MotionResult;
  skipped?: string;
  agentResult?: AgentResponse;
  clearPending?: boolean;
}

export function decideVoiceAction(
  resolution: Resolution,
  state: { continuousJogActive: boolean; robotReady: boolean },
  options: { transcript?: string; pendingPlan?: AgentPendingPlan } = {},
): VoiceAction {
  if (resolution.status === 'matched' && resolution.command?.type === 'stop') {
    return { kind: 'execute', command: resolution.command };
  }
  if (state.continuousJogActive) {
    return { kind: 'skip', reason: 'Release the joystick before speaking a command.' };
  }
  if (!state.robotReady) {
    return { kind: 'skip', reason: 'Robot is not ready yet.' };
  }
  if (options.pendingPlan || resolution.status === 'unmatched' || resolution.status === 'ambiguous') {
    return {
      kind: 'agent',
      transcript: options.transcript ?? resolution.normalized,
      resolution,
      pendingPlan: options.pendingPlan,
    };
  }
  if (!resolution.command) {
    return { kind: 'skip', reason: 'No executable command was produced.' };
  }
  if (resolution.gate?.ok === false) {
    return { kind: 'skip', reason: resolution.gate.reason ?? 'Safety gate rejected the command.' };
  }
  return { kind: 'execute', command: resolution.command };
}

let inFlight = false;

export async function executeVoiceCommand(
  resolution: Resolution,
  options: { transcript?: string; pendingPlan?: AgentPendingPlan } = {},
): Promise<VoiceOutcome> {
  const state = useMotionStore.getState();
  const action = decideVoiceAction(resolution, {
    continuousJogActive: state.continuousJogActive,
    robotReady: state.robotReady,
  }, options);

  if (action.kind === 'skip') return { skipped: action.reason };
  if (inFlight) return { skipped: 'Previous voice command is still executing.' };

  inFlight = true;
  try {
    if (action.kind === 'execute') {
      return {
        result: await useMotionStore.getState().dispatch(action.command),
        clearPending: action.command.type === 'stop' && options.pendingPlan != null,
      };
    }

    if (action.pendingPlan && /^\s*(cancel|never mind|nevermind)\s*[.!]?\s*$/i.test(action.transcript)) {
      return { skipped: 'Pending agent plan cancelled.', clearPending: true };
    }

    const before = [...useMotionStore.getState().jointAngles];
    const agentResult = await interpretAgent(action.transcript, action.resolution, before, action.pendingPlan);
    if (agentResult.status === 'needs_clarification') return { agentResult };
    if (agentResult.status === 'rejected' || !agentResult.command) {
      return {
        agentResult,
        skipped: agentResult.failureReason ?? 'The agent did not produce a safe command.',
        clearPending: true,
      };
    }

    const current = useMotionStore.getState().jointAngles;
    const planned = agentResult.plannedFromJoints;
    const stale = planned && JOINT_NAMES.some((name, index) => {
      const value = planned[name];
      return !Number.isFinite(value) || Math.abs(value - current[index]) > 1e-4;
    });
    if (stale) {
      return {
        agentResult,
        skipped: 'Robot pose changed while the instruction was being planned. Please try again.',
        clearPending: true,
      };
    }

    const token = `agent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    useMotionStore.getState().acquireAgentExecution(token);
    try {
      return {
        agentResult,
        result: await useMotionStore.getState().dispatch(agentResult.command, { agentToken: token }),
        clearPending: true,
      };
    } finally {
      useMotionStore.getState().releaseAgentExecution(token);
    }
  } finally {
    inFlight = false;
  }
}
