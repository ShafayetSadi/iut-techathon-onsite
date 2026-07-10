import type { MotionCommand, MotionResult } from '@/lib/motion/commands';
import { useMotionStore } from '@/lib/motion/store';
import type { Resolution } from './matcher';

export type VoiceAction =
  | { kind: 'execute'; command: MotionCommand }
  | { kind: 'skip'; reason: string };

export function decideVoiceAction(
  resolution: Resolution,
  state: { continuousJogActive: boolean; robotReady: boolean },
): VoiceAction {
  if (resolution.status === 'unmatched') {
    return { kind: 'skip', reason: resolution.reason ?? 'No command matched.' };
  }
  if (resolution.status === 'ambiguous') {
    return { kind: 'skip', reason: 'Not guessing.' };
  }
  if (!resolution.command) {
    return { kind: 'skip', reason: 'No executable command was produced.' };
  }
  if (resolution.gate?.ok === false) {
    return { kind: 'skip', reason: resolution.gate.reason ?? 'Safety gate rejected the command.' };
  }
  if (state.continuousJogActive) {
    return { kind: 'skip', reason: 'Release the joystick before speaking a command.' };
  }
  if (!state.robotReady) {
    return { kind: 'skip', reason: 'Robot is not ready yet.' };
  }
  return { kind: 'execute', command: resolution.command };
}

let inFlight = false;

export async function executeVoiceCommand(
  resolution: Resolution,
): Promise<{ result?: MotionResult; skipped?: string }> {
  const state = useMotionStore.getState();
  const action = decideVoiceAction(resolution, {
    continuousJogActive: state.continuousJogActive,
    robotReady: state.robotReady,
  });

  if (action.kind === 'skip') return { skipped: action.reason };
  if (inFlight) return { skipped: 'Previous voice command is still executing.' };

  inFlight = true;
  try {
    return { result: await useMotionStore.getState().dispatch(action.command) };
  } finally {
    inFlight = false;
  }
}
