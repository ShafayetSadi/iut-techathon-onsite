'use client';

import Joystick from '@/components/controls/Joystick';
import KeyboardGuide from '@/components/controls/KeyboardGuide';
import { useViewerStore, type JogStepMm } from '@/lib/viewer/viewerStore';

const JOG_STEPS: JogStepMm[] = [1, 5, 10];

export default function ManualControl() {
  const jogStepMm = useViewerStore((state) => state.jogStepMm);
  const setJogStepMm = useViewerStore((state) => state.setJogStepMm);

  return (
    <div className="manual-control">
      <div className="panel__h panel__h--sub">Tip jog</div>
      <div className="manual-control__joystick">
        <Joystick />
      </div>
      <div className="manual-step" aria-label="Jog step size">
        <span className="manual-step__label">Step size</span>
        <div className="manual-step__options" role="group" aria-label="Jog step size">
          {JOG_STEPS.map((step) => (
            <button
              key={step}
              type="button"
              className={`manual-step__btn ${jogStepMm === step ? 'manual-step__btn--active' : ''}`}
              aria-pressed={jogStepMm === step}
              onClick={() => setJogStepMm(step)}
            >
              {step}mm
            </button>
          ))}
        </div>
      </div>
      <KeyboardGuide />
    </div>
  );
}
