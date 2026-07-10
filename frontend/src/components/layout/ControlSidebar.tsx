'use client';

import { useState } from 'react';
import CollapsibleSection from '@/components/layout/CollapsibleSection';
import ManualControl from '@/components/controls/ManualControl';
import PinEntryControls from '@/components/controls/PinEntryControls';
import VoiceControls from '@/components/controls/VoiceControls';
import VoiceChat from '@/components/controls/VoiceChat';
import KeyboardJog from '@/components/controls/KeyboardJog';
import JointSliders from '@/components/viewer/JointSliders';
import ViewerControls from '@/components/viewer/ViewerControls';
import CartesianControls, { KeyTouchControls } from '@/components/viewer/CartesianControls';

type ControlMode = 'manual' | 'panel' | 'voice';

const MODES: { id: ControlMode; label: string }[] = [
  { id: 'manual', label: 'Manual' },
  { id: 'panel', label: 'Panel' },
  { id: 'voice', label: 'Voice' },
];

export default function ControlSidebar() {
  const [mode, setMode] = useState<ControlMode>('manual');

  return (
    <aside className={`panel panel--left ${mode === 'voice' ? 'panel--left--voice' : ''}`}>
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

      <div className={`mode-panel ${mode === 'voice' ? 'mode-panel--voice' : ''}`} role="tabpanel">
        {mode === 'manual' && (
          <>
            <ManualControl />
            <div className="panel-advanced">
              <CollapsibleSection title="IK target" defaultOpen={false}>
                <CartesianControls />
              </CollapsibleSection>
              <CollapsibleSection title="Advanced joint control" defaultOpen={false}>
                <JointSliders />
              </CollapsibleSection>
              <CollapsibleSection title="Viewer &amp; debug" defaultOpen={true}>
                <ViewerControls />
              </CollapsibleSection>
            </div>
          </>
        )}
        {mode === 'panel' && (
          <div className="mode-section">
            <h2 className="panel__h">Autonomous PIN</h2>
            <PinEntryControls />
            <h2 className="panel__h">Keypad test</h2>
            <p className="mode-section__hint">
              Click a key to test its configured target coordinate.
            </p>
            <KeyTouchControls />
          </div>
        )}
        {mode === 'voice' && (
          <div className="mode-section mode-section--voice">
            <h2 className="panel__h">Voice control</h2>
            <VoiceControls />
            <VoiceChat />
          </div>
        )}
      </div>

      <KeyboardJog />
    </aside>
  );
}
