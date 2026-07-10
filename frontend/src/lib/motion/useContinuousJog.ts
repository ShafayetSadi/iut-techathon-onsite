"use client";

/**
 * useContinuousJog.ts — shared rate-limited dispatcher for continuous jog
 * input (on-screen joystick + keyboard).
 */

import { useCallback, useEffect, useMemo } from "react";
import { registerJogCanceller, useMotionStore } from "./store";
import { jogStepMeters, useViewerStore } from "../viewer/viewerStore";
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
let currentStepMeters = JOG_STEP_M;

function vectorMagnitude(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

function hasInput(v: Vec3): boolean {
  return vectorMagnitude(v) >= EPSILON;
}

export function continuousJogDelta(
  unit: Vec3,
  stepMeters = JOG_STEP_M,
): Vec3 | null {
  const mag = vectorMagnitude(unit);
  if (mag < EPSILON) return null;
  const scale = stepMeters / mag;
  return { x: unit.x * scale, y: unit.y * scale, z: unit.z * scale };
}

function isAutonomousPinRunning(): boolean {
  const state = useMotionStore.getState();
  return (
    state.mode === "auto" &&
    state.status === "moving" &&
    state.activePin !== null
  );
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

export function cancelContinuousJog() {
  currentVector = ZERO;
  currentFine = false;
  gestureActive = false;
}

function tick() {
  if (inFlight) return;
  if (isAutonomousPinRunning()) {
    currentVector = ZERO;
    return;
  }
  const stepM = currentFine
    ? Math.min(currentStepMeters, FINE_JOG_STEP_M)
    : currentStepMeters;
  const delta = continuousJogDelta(currentVector, stepM);
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
      requestedStepMm: stepM * 1000,
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

function releaseTicker(): number {
  subscribers = Math.max(0, subscribers - 1);
  if (subscribers === 0 && intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
    updateVector(ZERO);
  }
  return subscribers;
}

export interface ContinuousJogController {
  /** Direction vector; magnitude does not affect normal/fine fixed step size. */
  setVector: (unit: Vec3, options?: { fine?: boolean }) => void;
}

export function useContinuousJog(): ContinuousJogController {
  const jogStepMm = useViewerStore((state) => state.jogStepMm);

  useEffect(() => {
    currentStepMeters = jogStepMeters(jogStepMm);
  }, [jogStepMm]);

  useEffect(() => {
    registerJogCanceller(cancelContinuousJog);
    acquireTicker();
    return () => {
      if (releaseTicker() === 0) registerJogCanceller(null);
    };
  }, []);

  const setVector = useCallback((unit: Vec3, options?: { fine?: boolean }) => {
    updateVector(unit, options?.fine === true);
  }, []);

  return useMemo(() => ({ setVector }), [setVector]);
}
