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
import { jogStepScale, useViewerStore } from "../viewer/viewerStore";
import type { Vec3 } from "./commands";

/** Tick rate for continuous jog dispatch. */
export const JOG_TICK_MS = 80;
/** Fixed cartesian step per normal continuous-jog tick, meters. */
export const JOG_STEP_M = 0.005;
/** Fixed cartesian step per fine continuous-jog tick, meters. */
export const FINE_JOG_STEP_M = 0.0015;

const EPSILON = 1e-3;
const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

let currentVector: Vec3 = ZERO;
let currentFine = false;
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

export function continuousJogDelta(unit: Vec3, fine = false): Vec3 | null {
  const mag = vectorMagnitude(unit);
  if (mag < EPSILON) return null;
  const step = fine ? FINE_JOG_STEP_M : JOG_STEP_M;
  const scale = step / mag;
  return { x: unit.x * scale, y: unit.y * scale, z: unit.z * scale };
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

function updateVector(unit: Vec3, fine = false) {
  if (isAutonomousPinRunning()) {
    currentVector = ZERO;
    currentFine = false;
    return;
  }
  currentVector = unit;
  currentFine = fine;
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
  const delta = continuousJogDelta(currentVector, currentFine);
  if (!delta) return;

  beginGesture();

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
  /** Direction vector; magnitude does not affect normal/fine fixed step size. */
  setVector: (unit: Vec3, options?: { fine?: boolean }) => void;
}

export function useContinuousJog(): ContinuousJogController {
  useEffect(() => {
    acquireTicker();
    return () => releaseTicker();
  }, []);

  const setVector = useCallback((unit: Vec3, options?: { fine?: boolean }) => {
    updateVector(unit, options?.fine === true);
  }, []);

  return useMemo(() => ({ setVector }), [setVector]);
}
