'use client';

import Joystick from '@/components/controls/Joystick';
import KeyboardGuide from '@/components/controls/KeyboardGuide';

export default function ManualControl() {
  return (
    <div className="manual-control">
      <div className="panel__h panel__h--sub">Tip jog</div>
      <div className="manual-control__joystick">
        <Joystick />
      </div>
      <KeyboardGuide />
    </div>
  );
}
