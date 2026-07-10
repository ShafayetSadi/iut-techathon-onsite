"use client";

/**
 * useContinuousJog.ts — shared rate-limited dispatcher for continuous jog
 * input (on-screen joystick + keyboard). See docs/phase2-frontend-brief.md §3.
 *
 * Every jog is a full HTTP round-trip to the backend IK solver. Firing one per
 * animation frame (60/s) would flood it and let responses race each other — an
 * older request resolving after a newer one would snap the arm backward for a
 * frame. Instead this keeps ONE shared ticker with at-most-one request in
 * flight at a time: a tick is skipped while a request is outstanding, so the
 * next tick always uses whatever direction is current when it fires. That's
 * "latest direction wins" without needing per-request sequence bookkeeping.
 *
 * The ticker/gate live at module scope (not inside the hook) so every
 * component calling `useContinuousJog()` — the joystick, the keyboard
 * listener, anything added later — shares the exact same dispatcher. Two
 * independent tickers would each individually rate-limit themselves but could
 * still overlap *each other's* requests, which defeats the point.
 */

import { useCallback, useEffect, useMemo } from "react";
import { useMotionStore } from "./store";
import type { Vec3 } from "./commands";

/** Tick rate for continuous jog dispatch. */
export const JOG_TICK_MS = 80;
/** Max jog speed at full stick/key deflection, mm/s. */
export const MAX_JOG_MM_S = 180;
/** Per-tick delta at full deflection, meters. */
export const MAX_JOG_DELTA_M = (MAX_JOG_MM_S / 1000) * (JOG_TICK_MS / 1000);

const EPSILON = 1e-3;
const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

let currentVector: Vec3 = ZERO;
let inFlight = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let subscribers = 0;
let gestureActive = false;

function vectorMagnitude(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

function hasInput(v: Vec3): boolean {
  return vectorMagnitude(v) >= EPSILON;
}

function isAutonomousPinRunning(): boolean {
  const state = useMotionStore.getState();
  return state.mode === "auto" && state.status === "moving" && state.activePin !== null;
}

function beginGesture() {
  if (isAutonomousPinRunning()) return;
  if (gestureActive) return;
  gestureActive = true;
  useMotionStore.getState().beginContinuousJog();
}

function endGestureIfIdle() {
  if (!gestureActive || inFlight || hasInput(currentVector)) return;
  gestureActive = false;
  useMotionStore.getState().endContinuousJog();
}

function updateVector(unit: Vec3) {
  if (isAutonomousPinRunning()) {
    currentVector = ZERO;
    return;
  }
  currentVector = unit;
  if (hasInput(unit)) {
    beginGesture();
  } else {
    endGestureIfIdle();
  }
}

function tick() {
  if (inFlight) return; // previous jog request still in flight — skip this tick
  if (isAutonomousPinRunning()) {
    currentVector = ZERO;
    return;
  }
  const v = currentVector;
  const mag = vectorMagnitude(v);
  if (mag < EPSILON) return;

  beginGesture();
  const clamped = Math.min(1, mag);
  const scale = (clamped / mag) * MAX_JOG_DELTA_M;
  const delta: Vec3 = { x: v.x * scale, y: v.y * scale, z: v.z * scale };

  inFlight = true;
  void useMotionStore
    .getState()
    .dispatch({
      type: "jog_cartesian",
      delta,
      frame: "world",
      continuous: true,
    })
    .finally(() => {
      inFlight = false;
      endGestureIfIdle();
    });
}

function acquireTicker() {
  subscribers += 1;
  if (intervalId == null) {
    intervalId = setInterval(tick, JOG_TICK_MS);
  }
}

function releaseTicker() {
  subscribers = Math.max(0, subscribers - 1);
  if (subscribers === 0 && intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
    updateVector(ZERO);
  }
}

export interface ContinuousJogController {
  /** Components in [-1, 1]; magnitude above 1 is clamped to full speed. */
  setVector: (unit: Vec3) => void;
}

export function useContinuousJog(): ContinuousJogController {
  useEffect(() => {
    acquireTicker();
    return () => releaseTicker();
  }, []);

  const setVector = useCallback((unit: Vec3) => {
    updateVector(unit);
  }, []);

  return useMemo(() => ({ setVector }), [setVector]);
}
