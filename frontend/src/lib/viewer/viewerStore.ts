/**
 * viewerStore.ts — display-only preferences for the 3D viewer.
 *
 * Kept separate from the motion store: none of this is authoritative arm state,
 * it only changes how the scene is drawn or how numbers are shown. The scene
 * subscribes to this outside React; the control panels write to it.
 */

import { create } from 'zustand';

export interface ViewerState {
  showCollision: boolean;
  useDegrees: boolean;
  showKeyLabels: boolean;
  showTestMarker: boolean;
  showEEMarker: boolean;
  autoRotate: boolean;
  /** Joint currently under the cursor in the 3D view (for sidebar highlight). */
  hoveredJoint: string | null;

  toggle: (key: BooleanViewerKey) => void;
  set: (key: BooleanViewerKey, value: boolean) => void;
  setHoveredJoint: (name: string | null) => void;
}

type BooleanViewerKey =
  | 'showCollision'
  | 'useDegrees'
  | 'showKeyLabels'
  | 'showTestMarker'
  | 'showEEMarker'
  | 'autoRotate';

export const useViewerStore = create<ViewerState>((set, get) => ({
  showCollision: false,
  useDegrees: true,
  showKeyLabels: true,
  showTestMarker: true,
  showEEMarker: true,
  autoRotate: false,
  hoveredJoint: null,

  toggle: (key) => set({ [key]: !get()[key] } as Pick<ViewerState, BooleanViewerKey>),
  set: (key, value) => set({ [key]: value } as Pick<ViewerState, BooleanViewerKey>),
  setHoveredJoint: (name) => set({ hoveredJoint: name }),
}));
