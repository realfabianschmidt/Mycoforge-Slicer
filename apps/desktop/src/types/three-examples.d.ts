declare module "three/examples/jsm/controls/OrbitControls.js" {
  export class OrbitControls {
    constructor(object: unknown, domElement?: HTMLElement);
    target: { set(x: number, y: number, z: number): void };
    enableDamping: boolean;
    enabled: boolean;
    update(): void;
    dispose(): void;
  }
}

declare module "three/examples/jsm/controls/TransformControls.js" {
  export class TransformControls {
    constructor(object: unknown, domElement?: HTMLElement);
    dragging: boolean;
    enabled: boolean;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
    attach(object: unknown): void;
    detach(): void;
    dispose(): void;
    getHelper(): unknown;
    setMode(mode: "translate" | "rotate" | "scale"): void;
    setRotationSnap(snap: number | null): void;
    setScaleSnap(snap: number | null): void;
    setSize(size: number): void;
    setSpace(space: "world" | "local"): void;
    setTranslationSnap(snap: number | null): void;
    addEventListener(type: string, listener: (event: { value?: boolean }) => void): void;
    removeEventListener(type: string, listener: (event: { value?: boolean }) => void): void;
  }
}

declare module "three/examples/jsm/loaders/STLLoader.js" {
  export class STLLoader {
    parse(data: ArrayBuffer): unknown;
  }
}
