'use client';

import dynamic from 'next/dynamic';
import ControlSidebar from '@/components/layout/ControlSidebar';
import ModeStatus from '@/components/dashboard/ModeStatus';
import JointReadout from '@/components/dashboard/JointReadout';
import EEReadout from '@/components/dashboard/EEReadout';
import EventLog from '@/components/dashboard/EventLog';
import CommandInspector from '@/components/dashboard/CommandInspector';

const RobotScene = dynamic(() => import('@/components/scene/RobotScene'), {
  ssr: false,
  loading: () => <div className="scene-host scene-host--loading">Initializing 3D scene…</div>,
});

export default function Home() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__logo">V</span>
          <div>
            <div className="topbar__title">Vantage · Dry Run</div>
            <div className="topbar__sub">6-DOF stylus-arm simulator</div>
          </div>
        </div>
        <div className="topbar__phase">Operator console</div>
      </header>

      <main className="layout">
        <ControlSidebar />

        <section className="stage">
          <RobotScene />
        </section>

        <aside className="panel panel--right">
          <h2 className="panel__h">Status</h2>
          <ModeStatus />
          <CommandInspector />
          <EEReadout />
          <JointReadout />
          <EventLog />
        </aside>
      </main>
    </div>
  );
}
