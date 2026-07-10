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
  const activePin = useMotionStore((s) => s.activePin);
  const pinProgress = useMotionStore((s) => s.pinProgress);
  const continuousJogActive = useMotionStore((s) => s.continuousJogActive);
  const autoError = useMotionStore((s) => s.autoError);
  const recording = useVoiceStore((s) => s.recording);
  const latestVoice = useVoiceStore((s) => s.entries[s.entries.length - 1]);

  const activeStep = pinProgress.find((step) => step.status === 'moving');
  const completedSteps = pinProgress.filter((step) => step.status === 'pressed').length;

  let command = '—';
  let safety = '—';
  let detail = '—';

  if (mode === 'auto' && activePin) {
    command = activeStep ? `PRESS KEY ${activeStep.digit}` : `RUN PIN ${activePin}`;
    detail = `Step ${completedSteps} / 6`;
    safety = autoError ? `BLOCKED · ${autoError}` : 'VALIDATED';
  } else if (mode === 'voice' && latestVoice) {
    command = latestVoice.text;
    if (latestVoice.status === 'pending') {
      safety = 'PENDING';
      detail = recording ? 'Listening…' : 'Transcribing…';
    } else if (latestVoice.status === 'error') {
      safety = 'FAILED';
      detail = latestVoice.text;
    } else if (latestVoice.resolution?.status === 'matched' && latestVoice.resolution.command) {
      detail = describeCommand(latestVoice.resolution.command);
      safety = latestVoice.resolution.gate?.ok ? 'PASSED' : `BLOCKED · ${latestVoice.resolution.gate?.reason}`;
    } else if (latestVoice.resolution) {
      detail = latestVoice.resolution.reason ?? latestVoice.resolution.status;
      safety = 'BLOCKED';
    }
  } else if (continuousJogActive || mode === 'jog') {
    command = 'JOG CARTESIAN';
    detail = 'Continuous world-frame jog';
    safety = 'VALIDATED';
  }

  return (
    <div className="cmd-inspector">
      <div className="readout__title">Command inspector</div>
      <dl className="cmd-inspector__grid">
        <div className="cmd-inspector__row">
          <dt>Source</dt>
          <dd>{SOURCE_LABEL[mode] ?? mode.toUpperCase()}</dd>
        </div>
        <div className="cmd-inspector__row">
          <dt>Input</dt>
          <dd>{command}</dd>
        </div>
        <div className="cmd-inspector__row">
          <dt>Normalized</dt>
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
          <dd>{status.toUpperCase()}</dd>
        </div>
      </dl>
    </div>
  );
}
