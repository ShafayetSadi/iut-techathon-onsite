import type { MotionCommand } from '@/lib/motion/commands';
import { BACKEND_URL, jointArrayToMap } from '@/lib/motion/backendApi';
import type { Resolution } from './matcher';

export type AgentStepStatus = 'resolved' | 'ambiguous' | 'invalid' | 'validated';

export interface AgentSemanticStep {
  id: string;
  sourceText: string;
  intent: string;
  analysis: string;
  status: 'resolved' | 'ambiguous' | 'invalid';
  action?: Record<string, unknown> | null;
  ambiguity?: string | null;
}

export interface AgentPendingPlan {
  confirmation: string;
  steps: AgentSemanticStep[];
  clarifyingQuestion?: string | null;
}

export interface AgentPlanStep {
  id: string;
  sourceText: string;
  intent: string;
  analysis: string;
  status: AgentStepStatus;
  command?: Exclude<MotionCommand, { type: 'sequence' }> | null;
}

export interface AgentResponse {
  status: 'ready' | 'needs_clarification' | 'rejected';
  confirmation: string;
  steps: AgentPlanStep[];
  command?: MotionCommand | null;
  clarifyingQuestion?: string | null;
  failureReason?: string | null;
  plannedFromJoints?: Record<string, number> | null;
  pendingPlan?: AgentPendingPlan | null;
}

export async function interpretAgent(
  transcript: string,
  resolution: Resolution,
  jointAngles: number[],
  pendingPlan?: AgentPendingPlan,
): Promise<AgentResponse> {
  const res = await fetch(`${BACKEND_URL}/api/agent/interpret`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript,
      resolutionStatus: pendingPlan ? 'clarification' : resolution.status,
      alternatives: resolution.alternatives,
      currentJoints: jointArrayToMap(jointAngles),
      pendingPlan,
    }),
  });
  const payload = (await res.json().catch(() => null)) as AgentResponse & {
    reason?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(payload?.reason || payload?.detail || `Agent request failed (${res.status})`);
  }
  return payload;
}
