'use client';

import { useMotionStore } from '@/lib/motion/store';
import { describeCommand } from '@/lib/voice/matcher';
import { useVoiceStore } from '@/lib/voice/voiceStore';

const SOURCE_LABEL: Record<string, string> = {
  idle: 'IDLE',
  jog: 'JOYSTICK / KEYBOARD',
  voice: 'VOICE',
  auto: 'AUTO PIN',
};

export default function CommandInspector() {
  const mode = useMotionStore((s) => s.mode);
  const status = useMotionStore((s) => s.status);
  const log = useMotionStore((s) => s.log);
  const activePin = useMotionStore((s) => s.activePin);
  const pinProgress = useMotionStore((s) => s.pinProgress);
  const continuousJogActive = useMotionStore((s) => s.continuousJogActive);
  const autoError = useMotionStore((s) => s.autoError);
  const lastCommand = useMotionStore((s) => s.lastCommand);
  const lastError = useMotionStore((s) => s.lastError);
  const target = useMotionStore((s) => s.target);
  const recording = useVoiceStore((s) => s.recording);
  const latestVoice = useVoiceStore((s) => s.entries[s.entries.length - 1]);

  const activeStep = pinProgress.find((step) => step.status === 'moving');
  const completedSteps = pinProgress.filter((step) => step.status === 'pressed').length;
  const showLatestVoice = mode === 'idle' && latestVoice;
  const latestError =
    status === 'error'
      ? [...log].reverse().find((entry) => entry.level === 'error')
      : null;

  let command = lastCommand ?? '—';
  let safety = '—';
  let detailLabel = 'Target';
  let detail = target ? `${target.x.toFixed(3)}, ${target.y.toFixed(3)}, ${target.z.toFixed(3)} m` : '—';
  let source = SOURCE_LABEL[mode] ?? mode.toUpperCase();
  let commandStatus = status.toUpperCase();
  const safetySummary = lastError ? `LAST ERROR · ${lastError}` : undefined;

  if (mode === 'auto' && activePin) {
    command = activeStep ? `PRESS KEY ${activeStep.digit}` : `RUN PIN ${activePin}`;
    detailLabel = 'Progress';
    detail = `Step ${completedSteps} / 6`;
    safety = autoError ? `BLOCKED · ${autoError}` : 'VALIDATED';
  } else if ((mode === 'voice' || showLatestVoice) && latestVoice) {
    source = mode === 'voice' ? 'VOICE' : 'LAST VOICE';
    command = latestVoice.text;
    if (latestVoice.status === 'pending') {
      safety = 'PENDING';
      detailLabel = 'Stage';
      detail = recording ? 'Listening…' : 'Transcribing…';
      commandStatus = 'PENDING';
    } else if (latestVoice.status === 'error') {
      safety = 'FAILED';
      detailLabel = 'Transcript';
      detail = latestVoice.text;
      commandStatus = 'FAILED';
    } else if (latestVoice.resolution?.status === 'matched' && latestVoice.resolution.command) {
      detailLabel = 'Normalized';
      detail = describeCommand(latestVoice.resolution.command);
      safety = latestVoice.resolution.gate?.ok ? 'PASSED' : `BLOCKED · ${latestVoice.resolution.gate?.reason}`;
      if (latestVoice.result) {
        commandStatus = latestVoice.result.ok ? 'EXECUTED' : 'REJECTED';
      } else if (latestVoice.skipped) {
        commandStatus = 'SKIPPED';
        safety = `BLOCKED · ${latestVoice.skipped}`;
      }
    } else if (latestVoice.resolution) {
      detailLabel = 'Resolution';
      detail = latestVoice.resolution.reason ?? latestVoice.resolution.status;
      safety = 'BLOCKED';
      commandStatus = 'REJECTED';
    }
  } else if (continuousJogActive || mode === 'jog') {
    command = 'JOG CARTESIAN';
    detailLabel = 'Mode';
    detail = 'Continuous world-frame jog';
    safety = latestError ? `BLOCKED · ${latestError.text}` : 'VALIDATED';
  } else if (safetySummary) {
    safety = safetySummary;
  }

  return (
    <div className="cmd-inspector">
      <div className="readout__title">Command inspector</div>
      <dl className="cmd-inspector__grid">
        <div className="cmd-inspector__row">
          <dt>Source</dt>
          <dd>{source}</dd>
        </div>
        <div className="cmd-inspector__row">
          <dt>Input</dt>
          <dd>{command}</dd>
        </div>
        <div className="cmd-inspector__row">
          <dt>{detailLabel}</dt>
          <dd>{detail}</dd>
        </div>
        <div className="cmd-inspector__row">
          <dt>Safety</dt>
          <dd
            className={
              safety.startsWith('PASSED') || safety === 'VALIDATED'
                ? 'cmd-inspector__ok'
                : safety.startsWith('BLOCKED') || safety === 'FAILED'
                  ? 'cmd-inspector__err'
                  : undefined
            }
          >
            {safety}
          </dd>
        </div>
        <div className="cmd-inspector__row">
          <dt>Status</dt>
          <dd>{commandStatus}</dd>
        </div>
      </dl>
    </div>
  );
}
