'use client';

import Joystick from '@/components/controls/Joystick';
import KeyboardGuide from '@/components/controls/KeyboardGuide';
import { useViewerStore, type JogStepMm } from '@/lib/viewer/viewerStore';

const STEP_OPTIONS: JogStepMm[] = [1, 5, 10];

export default function ManualControl() {
  const jogStepMm = useViewerStore((s) => s.jogStepMm);
  const setJogStepMm = useViewerStore((s) => s.setJogStepMm);

  return (
    <div className="manual-control">
      <div className="panel__h panel__h--sub">Tip jog</div>
      <div className="manual-control__joystick">
        <Joystick />
      </div>

      <div className="step-size">
        <span className="step-size__label">Step size</span>
        <div className="step-size__opts" role="group" aria-label="Jog step size">
          {STEP_OPTIONS.map((mm) => (
            <button
              key={mm}
              className={`step-size__btn ${jogStepMm === mm ? 'step-size__btn--active' : ''}`}
              type="button"
              onClick={() => setJogStepMm(mm)}
            >
              {mm} mm
            </button>
          ))}
        </div>
      </div>

      <KeyboardGuide />
    </div>
  );
}
