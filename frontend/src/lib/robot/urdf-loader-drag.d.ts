/**
 * Ambient types for urdf-loader's drag-controls subpath, which ships as plain
 * JS with no .d.ts. Mirrors the reference implementation's public surface.
 */
declare module 'urdf-loader/src/URDFDragControls.js' {
  import { Camera, Object3D, Ray, Scene } from 'three';
  import { URDFJoint } from 'urdf-loader';

  export class URDFDragControls {
    constructor(scene: Object3D);
    enabled: boolean;
    hovered: URDFJoint | null;
    manipulating: URDFJoint | null;
    updateJoint(joint: URDFJoint, angle: number): void;
    onDragStart(joint: URDFJoint): void;
    onDragEnd(joint: URDFJoint): void;
    onHover(joint: URDFJoint): void;
    onUnhover(joint: URDFJoint): void;
    moveRay(ray: Ray): void;
    update(): void;
  }

  export class PointerURDFDragControls extends URDFDragControls {
    constructor(scene: Scene | Object3D, camera: Camera, domElement: HTMLElement);
    dispose(): void;
  }
}
