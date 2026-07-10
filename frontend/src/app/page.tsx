'use client';

import dynamic from 'next/dynamic';
import ModeStatus from '@/components/dashboard/ModeStatus';
import JointReadout from '@/components/dashboard/JointReadout';
import EEReadout from '@/components/dashboard/EEReadout';
import EventLog from '@/components/dashboard/EventLog';
import JointSliders from '@/components/viewer/JointSliders';
import ViewerControls from '@/components/viewer/ViewerControls';
import CartesianControls, { KeyTouchControls } from '@/components/viewer/CartesianControls';

// The scene touches WebGL / window on mount, so it is client-only.
const RobotScene = dynamic(() => import('@/components/scene/RobotScene'), {
  ssr: false,
  loading: () => <div className="scene-host scene-host--loading">Initializing 3D scene…</div>,
});

export default function Home() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__logo">◈</span>
          <div>
            <div className="topbar__title">Vantage · Dry Run</div>
            <div className="topbar__sub">6-DOF stylus-arm simulator</div>
          </div>
        </div>
        <div className="topbar__phase">Phase 2 — Move the Arm</div>
      </header>

      <main className="layout">
        <aside className="panel panel--left">
          <h2 className="panel__h">Joint control</h2>
          <JointSliders />
          <h2 className="panel__h">IK target</h2>
          <CartesianControls />
          <h2 className="panel__h">Test panel</h2>
          <KeyTouchControls />
          <h2 className="panel__h">Viewer</h2>
          <ViewerControls />
        </aside>

        <section className="stage">
          <RobotScene />
        </section>

        <aside className="panel panel--right">
          <h2 className="panel__h">Status</h2>
          <ModeStatus />
          <EEReadout />
          <JointReadout />
          <EventLog />
        </aside>
      </main>
    </div>
  );
}
