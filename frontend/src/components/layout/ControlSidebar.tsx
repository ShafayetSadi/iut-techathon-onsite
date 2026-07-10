'use client';

import { useState } from 'react';
import CollapsibleSection from '@/components/layout/CollapsibleSection';
import ManualControl from '@/components/controls/ManualControl';
import PinEntryControls from '@/components/controls/PinEntryControls';
import VoiceControls from '@/components/controls/VoiceControls';
import KeyboardJog from '@/components/controls/KeyboardJog';
import JointSliders from '@/components/viewer/JointSliders';
import ViewerControls from '@/components/viewer/ViewerControls';
import CartesianControls, { KeyTouchControls } from '@/components/viewer/CartesianControls';

type ControlMode = 'manual' | 'auto' | 'voice' | 'engineering';

const MODES: { id: ControlMode; label: string }[] = [
  { id: 'manual', label: 'Manual' },
  { id: 'auto', label: 'Auto PIN' },
  { id: 'voice', label: 'Voice' },
  { id: 'engineering', label: 'Dev' },
];

export default function ControlSidebar() {
  const [mode, setMode] = useState<ControlMode>('manual');

  return (
    <aside className="panel panel--left">
      <div className="mode-tabs" role="tablist" aria-label="Control mode">
        {MODES.map((item) => (
          <button
            key={item.id}
            className={`mode-tabs__btn ${mode === item.id ? 'mode-tabs__btn--active' : ''}`}
            type="button"
            role="tab"
            aria-selected={mode === item.id}
            onClick={() => setMode(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mode-panel" role="tabpanel">
        {mode === 'manual' && <ManualControl />}
        {mode === 'auto' && (
          <div className="mode-section">
            <h2 className="panel__h">Autonomous PIN</h2>
            <PinEntryControls />
          </div>
        )}
        {mode === 'voice' && (
          <div className="mode-section">
            <h2 className="panel__h">Voice control</h2>
            <VoiceControls />
          </div>
        )}
        {mode === 'engineering' && (
          <div className="mode-section">
            <h2 className="panel__h">IK target</h2>
            <CartesianControls />
            <h2 className="panel__h">Keypad test</h2>
            <p className="mode-section__hint">
              Click a key to test its configured target coordinate.
            </p>
            <KeyTouchControls />
          </div>
        )}
      </div>

      <div className="panel-advanced">
        <CollapsibleSection title="Advanced joint control" defaultOpen={false}>
          <JointSliders />
        </CollapsibleSection>
        <CollapsibleSection title="Viewer &amp; debug" defaultOpen={true}>
          <ViewerControls />
        </CollapsibleSection>
      </div>

      <KeyboardJog />
    </aside>
  );
}
