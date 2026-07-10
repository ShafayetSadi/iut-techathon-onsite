'use client';

/**
 * RobotScene.tsx — the one Three.js host (this is "the tool").
 *
 * A single mounted component owns the renderer, scene, camera, OrbitControls,
 * the URDF robot, the 6-key panel, and the interactive drag-to-rotate joints
 * (reproducing gkjohnson's urdf-loaders viewer). It is a *renderer of* the
 * authoritative motion store, never an owner of arm state:
 *
 *   render loop → read store.jointAngles → apply to robot → FK → write eePosition
 *   drag / IK  → write store.jointAngles (never the robot directly)
 *
 * The whole scene is drawn in the base frame (world == base_link, Z-up), so the
 * panel coordinates from key.config.json and the FK result line up with no frame
 * conversion — the mitigation for the coordinate-frame risk.
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerURDFDragControls } from 'urdf-loader/src/URDFDragControls.js';
import type { URDFJoint, URDFRobot } from 'urdf-loader';

import { loadRobot, logRobotInfo } from '@/lib/robot/urdfLoad';
import { applyJoints, forwardKinematics } from '@/lib/robot/robotAdapter';
import { loadKeyConfig, toPanelKeys } from '@/lib/panel/keyConfig';
import { useMotionStore } from '@/lib/motion/store';
import { useViewerStore } from '@/lib/viewer/viewerStore';
import { JOINT_NAMES, TOUCH_TOLERANCE_M } from '@/config/robot.config';

const HIGHLIGHT = new THREE.Color('#d97757'); // clay accent, matches the UI chrome
const KEY_COLOR = new THREE.Color('#7fa1c4');
const KEY_MOVING_COLOR = new THREE.Color('#d3a75c');
const KEY_PRESSED_COLOR = new THREE.Color('#3ddc84');
const KEY_MOVING_EMISSIVE = new THREE.Color('#453a22');
const KEY_PRESSED_EMISSIVE = new THREE.Color('#123820');
const KEY_VISUAL_WIDTH_M = 0.03;
const KEY_VISUAL_DEPTH_M = 0.03;
const KEY_VISUAL_HEIGHT_M = 0.016;
const KEY_PRESS_TRAVEL_M = 0.004;
const PANEL_PLATE_HEIGHT_M = 0.008;
const PANEL_MARGIN_M = 0.05;
const LABEL_OFFSET_M = 0.03;

type KeyVisualStatus = 'idle' | 'moving' | 'pressed';

interface KeyVisual {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  touchPoint: THREE.Vector3;
  baseZ: number;
  idleColor: THREE.Color;
  idleEmissive: THREE.Color;
}

/** Collect the meshes that belong directly to a joint's link, not deeper joints. */
function collectLinkMeshes(joint: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  const walk = (node: THREE.Object3D) => {
    for (const child of node.children) {
      if ((child as unknown as URDFJoint).isURDFJoint) continue; // stop at nested joints
      if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh);
      walk(child);
    }
  };
  walk(joint);
  return meshes;
}

function makeAxisLabelSprite(text: string, color: string): THREE.Sprite {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.font = 'bold 68px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.055, 0.055, 0.055);
  sprite.renderOrder = 10;
  return sprite;
}

function keyStatusForDigit(
  digit: string,
  key: KeyVisual,
  tipPosition: THREE.Vector3,
  motion: ReturnType<typeof useMotionStore.getState>,
): KeyVisualStatus {
  if (tipPosition.distanceTo(key.touchPoint) <= TOUCH_TOLERANCE_M) return 'pressed';

  const isAutoPlaying = motion.mode === 'auto' && motion.status === 'moving' && motion.activePin !== null;
  if (!isAutoPlaying) return 'idle';

  const matchingSteps = motion.pinProgress.filter((step) => step.digit === digit);
  if (matchingSteps.some((step) => step.status === 'moving')) return 'moving';
  if (matchingSteps.some((step) => step.status === 'pressed')) return 'pressed';
  return 'idle';
}

function applyKeyVisualStatus(key: KeyVisual, status: KeyVisualStatus): void {
  const mat = key.mesh.material;
  if (status === 'pressed') {
    mat.color.copy(KEY_PRESSED_COLOR);
    mat.emissive.copy(KEY_PRESSED_EMISSIVE);
    mat.emissiveIntensity = 0.85;
    key.mesh.position.z = key.baseZ - KEY_PRESS_TRAVEL_M;
    return;
  }

  if (status === 'moving') {
    mat.color.copy(KEY_MOVING_COLOR);
    mat.emissive.copy(KEY_MOVING_EMISSIVE);
    mat.emissiveIntensity = 0.75;
    key.mesh.position.z = key.baseZ;
    return;
  }

  mat.color.copy(key.idleColor);
  mat.emissive.copy(key.idleEmissive);
  mat.emissiveIntensity = 0.5;
  key.mesh.position.z = key.baseZ;
}

/** Ground-plane X/Y arrows at the base origin — matches dashboard axis colors. */
function createGroundXYLegend(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'xy-legend';
  const z = 0.006;
  const len = 0.42;
  const origin = new THREE.Vector3(0, 0, z);

  const xArrow = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    origin,
    len,
    0xd97878,
    0.07,
    0.045,
  );
  const yArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    origin,
    len,
    0x8fbf8a,
    0.07,
    0.045,
  );
  group.add(xArrow, yArrow);

  const xLabel = makeAxisLabelSprite('X', '#d97878');
  xLabel.position.set(len + 0.05, 0, z + 0.01);
  group.add(xLabel);

  const yLabel = makeAxisLabelSprite('Y', '#8fbf8a');
  yLabel.position.set(0, len + 0.05, z + 0.01);
  group.add(yLabel);

  return group;
}

const LEGEND_AXIS_LEN = 0.82;

function makeLabelSprite(text: string): THREE.Sprite {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(23,21,19,0.88)';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#d97757';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 72px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2 + 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.045, 0.045, 0.045);
  sprite.renderOrder = 10;
  return sprite;
}

export default function RobotScene() {
  const mountRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const legendEl = legendRef.current;
    const xLine = legendEl?.querySelector<SVGLineElement>('.axis-legend__line--x');
    const yLine = legendEl?.querySelector<SVGLineElement>('.axis-legend__line--y');
    const xText = legendEl?.querySelector<SVGTextElement>('.axis-legend__text--x');
    const yText = legendEl?.querySelector<SVGTextElement>('.axis-legend__text--y');

    // ── Z-up world (base frame) ──────────────────────────────────────────
    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#171513');
    scene.fog = new THREE.Fog('#171513', 4, 12);

    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 600;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 100);
    camera.up.set(0, 0, 1);
    camera.position.set(1.7, -1.7, 1.35);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 0.6);
    controls.minDistance = 0.4;
    controls.maxDistance = 6;

    // ── Lights ───────────────────────────────────────────────────────────
    scene.add(new THREE.HemisphereLight('#c8d4e0', '#1a1d22', 0.9));
    const ambient = new THREE.AmbientLight('#ffffff', 0.25);
    scene.add(ambient);
    const key = new THREE.DirectionalLight('#ffffff', 1.7);
    key.position.set(0.8, -1.1, 2.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 4;
    // Frustum tightened to the arm's actual reach (was ±1.6m — mostly empty
    // space around a ~0.15m-radius arm, which starved shadow-map resolution
    // right where it mattered: the small sphere/cylinder joint hubs).
    key.shadow.camera.left = -0.9;
    key.shadow.camera.right = 0.9;
    key.shadow.camera.top = 1.7;
    key.shadow.camera.bottom = -0.1;
    // Depth bias alone wasn't enough on the curved, overlapping joint-hub
    // geometry (sphere hub flush against cylinder link) — it self-shadowed
    // in a banded/hatched pattern ("shadow acne"). normalBias offsets the
    // sample along the surface normal instead of view depth, which is the
    // correct fix for acne on curved surfaces.
    key.shadow.bias = -0.0015;
    key.shadow.normalBias = 0.015;
    key.target.position.set(0, 0, 0.55);
    scene.add(key.target);
    scene.add(key);

    // ── Ground + grid (XY plane at z=0 in the Z-up world) ─────────────────
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 12),
      new THREE.ShadowMaterial({ opacity: 0.35 }),
    );
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(12, 48, 0x3a332a, 0x241f1a);
    grid.rotation.x = Math.PI / 2; // lay flat in XY for the Z-up world
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.6;
    scene.add(grid);

    scene.add(createGroundXYLegend());

    // ── Markers that live outside the robot ──────────────────────────────
    const eeMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 16, 16),
      new THREE.MeshStandardMaterial({ color: '#87a878', emissive: '#2b3a24', emissiveIntensity: 0.6 }),
    );
    eeMarker.renderOrder = 5;
    scene.add(eeMarker);

    const targetMarker = new THREE.Mesh(
      new THREE.TorusGeometry(0.02, 0.004, 12, 24),
      new THREE.MeshStandardMaterial({ color: '#d3a75c', emissive: '#453a22', emissiveIntensity: 0.6 }),
    );
    targetMarker.visible = false;
    scene.add(targetMarker);

    const labelSprites: THREE.Sprite[] = [];
    const keyVisuals = new Map<string, KeyVisual>();

    // ── State refs used by the render loop ───────────────────────────────
    let robot: URDFRobot | null = null;
    let colliderNodes: THREE.Object3D[] = [];
    let disposed = false;

    const motion = useMotionStore;
    const viewer = useViewerStore;

    // ── Load the robot + panel ───────────────────────────────────────────
    (async () => {
      try {
        robot = await loadRobot();
        if (disposed) return;
        logRobotInfo(robot);

        // Prep collision geometry: translucent, hidden until toggled.
        colliderNodes = Object.values(robot.colliders);
        for (const node of colliderNodes) {
          node.visible = false;
          node.traverse((c) => {
            const m = c as THREE.Mesh;
            if (m.isMesh) {
              m.material = new THREE.MeshBasicMaterial({
                color: '#00e5ff',
                wireframe: true,
                transparent: true,
                opacity: 0.5,
              });
            }
          });
        }

        scene.add(robot);
        motion.getState().setRobotReady(true);
        motion.getState().pushLog(
          `URDF loaded: ${Object.keys(robot.joints).length} joints, EE = stylus_tip.`,
          'ok',
        );

        // Panel + labels + test marker.
        const cfg = await loadKeyConfig();
        if (disposed) return;
        const keys = toPanelKeys(cfg);

        const panelGroup = new THREE.Group();
        panelGroup.name = 'panel';

        // Backing plate spanning the keys.
        const xs = keys.map((k) => k.position.x);
        const ys = keys.map((k) => k.position.y);
        const zPlate = Math.min(...keys.map((k) => k.position.z)) - KEY_VISUAL_HEIGHT_M - PANEL_PLATE_HEIGHT_M / 2;
        const plate = new THREE.Mesh(
          new THREE.BoxGeometry(
            Math.max(...xs) - Math.min(...xs) + PANEL_MARGIN_M,
            Math.max(...ys) - Math.min(...ys) + PANEL_MARGIN_M,
            PANEL_PLATE_HEIGHT_M,
          ),
          new THREE.MeshStandardMaterial({ color: '#171b20', roughness: 0.9, metalness: 0.1 }),
        );
        plate.position.set(
          (Math.max(...xs) + Math.min(...xs)) / 2,
          (Math.max(...ys) + Math.min(...ys)) / 2,
          zPlate,
        );
        plate.receiveShadow = true;
        panelGroup.add(plate);

        for (const k of keys) {
          const idleColor = KEY_COLOR;
          const idleEmissive = new THREE.Color('#0e2440');
          // key.config.json provides authoritative stylus touch points, not
          // physical key dimensions. These boxes are visual markers whose top
          // centers align exactly with the provided coordinates.
          const box = new THREE.Mesh(
            new THREE.BoxGeometry(KEY_VISUAL_WIDTH_M, KEY_VISUAL_DEPTH_M, KEY_VISUAL_HEIGHT_M),
            new THREE.MeshStandardMaterial({
              color: idleColor,
              emissive: idleEmissive,
              emissiveIntensity: 0.5,
              roughness: 0.5,
            }),
          );
          box.castShadow = true;
          box.receiveShadow = true;
          box.position.set(k.position.x, k.position.y, k.position.z - KEY_VISUAL_HEIGHT_M / 2);
          keyVisuals.set(k.label, {
            mesh: box,
            touchPoint: new THREE.Vector3(k.position.x, k.position.y, k.position.z),
            baseZ: box.position.z,
            idleColor: idleColor.clone(),
            idleEmissive: idleEmissive.clone(),
          });
          panelGroup.add(box);

          const label = makeLabelSprite(k.label);
          label.position.set(k.position.x, k.position.y, k.position.z + LABEL_OFFSET_M);
          panelGroup.add(label);
          labelSprites.push(label);
        }
        scene.add(panelGroup);

        motion.getState().pushLog(
          `Panel rendered: ${keys.length} keys (${cfg.units}, frame ${cfg.frame}).`,
          'ok',
        );
      } catch (err) {
        motion.getState().pushLog(
          `Failed to load robot/panel: ${(err as Error).message}`,
          'error',
        );
        // eslint-disable-next-line no-console
        console.error(err);
      }
    })();

    // ── Interactive joint drag (gkjohnson-style) ─────────────────────────
    const highlighted = new Map<THREE.Mesh, THREE.Color>();
    const clearHighlight = () => {
      highlighted.forEach((color, mesh) => {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat.emissive) mat.emissive.copy(color);
      });
      highlighted.clear();
    };

    const dragControls = new PointerURDFDragControls(scene, camera, renderer.domElement);

    // Route joint manipulation through the store — keep it the single source
    // of truth. The robot updates on the next render-loop tick.
    dragControls.updateJoint = (joint: URDFJoint, angle: number) => {
      const state = motion.getState();
      if (state.mode === 'auto' && state.status === 'moving' && state.activePin !== null) return;
      state.setJointByName(joint.name, angle);
    };
    dragControls.onHover = (joint: URDFJoint) => {
      const state = motion.getState();
      if (state.mode === 'auto' && state.status === 'moving' && state.activePin !== null) return;
      controls.enabled = false; // don't orbit while a joint is grabbable
      renderer.domElement.style.cursor = 'grab';
      viewer.getState().setHoveredJoint(joint.name);
      for (const mesh of collectLinkMeshes(joint)) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat.emissive && !highlighted.has(mesh)) {
          highlighted.set(mesh, mat.emissive.clone());
          mat.emissive.copy(HIGHLIGHT);
        }
      }
    };
    dragControls.onUnhover = () => {
      controls.enabled = true;
      renderer.domElement.style.cursor = '';
      viewer.getState().setHoveredJoint(null);
      clearHighlight();
    };
    dragControls.onDragStart = () => {
      const state = motion.getState();
      if (state.mode === 'auto' && state.status === 'moving' && state.activePin !== null) return;
      renderer.domElement.style.cursor = 'grabbing';
      state.setMode('jog');
      state.setStatus('moving');
    };
    dragControls.onDragEnd = () => {
      const state = motion.getState();
      if (state.mode === 'auto' && state.status === 'moving' && state.activePin !== null) return;
      renderer.domElement.style.cursor = 'grab';
      state.setStatus('ready');
    };

    // ── Render loop ──────────────────────────────────────────────────────
    const eeVec = new THREE.Vector3();
    const legendX = new THREE.Vector3();
    const legendY = new THREE.Vector3();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const m = motion.getState();
      const v = viewer.getState();

      if (robot) {
        // Apply authoritative angles (with ignore-limits reflected on the robot).
        for (const name of JOINT_NAMES) {
          const j = robot.joints[name];
          if (j) j.ignoreLimits = m.ignoreLimits;
        }
        applyJoints(robot, m.jointAngles);
        robot.updateMatrixWorld(true);

        // FK → write EE back to the store.
        const ee = forwardKinematics(robot);
        m.setEEPosition(ee);
        eeVec.set(ee.x, ee.y, ee.z);
        eeMarker.position.copy(eeVec);
        eeMarker.visible = v.showEEMarker;

        // Collision + label + marker visibility toggles.
        for (const node of colliderNodes) node.visible = v.showCollision;
        for (const sp of labelSprites) sp.visible = v.showKeyLabels;
        keyVisuals.forEach((visual, digit) => {
          applyKeyVisualStatus(visual, keyStatusForDigit(digit, visual, eeVec, m));
        });

        // Target ring.
        if (m.target && !(m.mode === 'auto' && m.activePin !== null)) {
          targetMarker.position.set(m.target.x, m.target.y, m.target.z);
          targetMarker.visible = true;
        } else {
          targetMarker.visible = false;
        }
      }

      controls.autoRotate = v.autoRotate;
      controls.autoRotateSpeed = 1.0;
      controls.update();

      // Screen-corner X/Y compass — world axes projected into the view plane.
      legendX.set(1, 0, 0).applyQuaternion(camera.quaternion);
      legendY.set(0, 1, 0).applyQuaternion(camera.quaternion);
      const tip = (v: THREE.Vector3) => ({
        x: v.x * LEGEND_AXIS_LEN,
        y: -v.y * LEGEND_AXIS_LEN,
      });
      const xTip = tip(legendX);
      const yTip = tip(legendY);
      const labelAt = (v: THREE.Vector3) => ({
        x: v.x * LEGEND_AXIS_LEN * 1.24,
        y: -v.y * LEGEND_AXIS_LEN * 1.24,
      });
      const xLbl = labelAt(legendX);
      const yLbl = labelAt(legendY);
      xLine?.setAttribute('x2', String(xTip.x));
      xLine?.setAttribute('y2', String(xTip.y));
      yLine?.setAttribute('x2', String(yTip.x));
      yLine?.setAttribute('y2', String(yTip.y));
      xText?.setAttribute('x', String(xLbl.x));
      xText?.setAttribute('y', String(xLbl.y));
      yText?.setAttribute('x', String(yLbl.x));
      yText?.setAttribute('y', String(yLbl.y));

      renderer.render(scene, camera);
    };
    tick();

    // ── Resize ───────────────────────────────────────────────────────────
    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    // ── Cleanup ──────────────────────────────────────────────────────────
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      dragControls.dispose();
      controls.dispose();
      renderer.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
        else mat?.dispose();
      });
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      motion.getState().setRobotReady(false);
    };
  }, []);

  return (
    <div ref={mountRef} className="scene-host">
      <div ref={legendRef} className="axis-legend" aria-label="X and Y axis orientation">
        <svg className="axis-legend__svg" viewBox="-1 -1 2 2" aria-hidden="true">
          <circle className="axis-legend__origin" cx="0" cy="0" r="0.045" />
          <line className="axis-legend__line axis-legend__line--x" x1="0" y1="0" x2="0.82" y2="0" />
          <line className="axis-legend__line axis-legend__line--y" x1="0" y1="0" x2="0" y2="0.82" />
          <text className="axis-legend__text axis-legend__text--x" x="1" y="0">
            X
          </text>
          <text className="axis-legend__text axis-legend__text--y" x="0" y="-1">
            Y
          </text>
        </svg>
      </div>
    </div>
  );
}
