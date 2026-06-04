declare module "three" {
  export const DoubleSide: number;

  export class Color {
    constructor(value?: number | string);
    setHex(value: number): this;
  }

  export class Vector2 {
    constructor(x?: number, y?: number);
    x: number;
    y: number;
  }

  export class Vector3 {
    constructor(x?: number, y?: number, z?: number);
    x: number;
    y: number;
    z: number;
    copy(value: Vector3): this;
    set(x: number, y: number, z: number): this;
    sub(value: Vector3): this;
  }

  export class Euler {
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number, order?: string): this;
  }

  export class Object3D {
    position: Vector3;
    rotation: Euler;
    scale: Vector3 & { setScalar(value: number): void };
    geometry?: BufferGeometry;
    material?: Material | Material[];
    add(...objects: Object3D[]): this;
    traverse(callback: (object: Object3D) => void): void;
    updateMatrixWorld(force?: boolean): void;
  }

  export class Group extends Object3D {}

  export class Scene extends Object3D {
    background: Color | null;
  }

  export class Camera extends Object3D {}

  export class PerspectiveCamera extends Camera {
    constructor(fov?: number, aspect?: number, near?: number, far?: number);
    aspect: number;
    far: number;
    near: number;
    up: Vector3;
    lookAt(x: number, y: number, z: number): void;
    lookAt(value: Vector3): void;
    updateProjectionMatrix(): void;
  }

  export class WebGLRenderer {
    constructor(params?: { antialias?: boolean });
    domElement: HTMLCanvasElement;
    dispose(): void;
    render(scene: Scene, camera: Camera): void;
    setPixelRatio(value: number): void;
    setSize(width: number, height: number): void;
  }

  export class BufferGeometry {
    boundingBox: Box3 | null;
    computeBoundingBox(): void;
    computeVertexNormals(): void;
    dispose(): void;
    setFromPoints(points: Vector3[]): this;
    translate(x: number, y: number, z: number): this;
  }

  export class PlaneGeometry extends BufferGeometry {
    constructor(width?: number, height?: number);
  }

  export class SphereGeometry extends BufferGeometry {
    constructor(radius?: number, widthSegments?: number, heightSegments?: number);
  }

  export class Material {
    dispose(): void;
  }

  export class MeshBasicMaterial extends Material {
    constructor(params?: Record<string, unknown>);
    color: Color;
  }

  export class MeshStandardMaterial extends Material {
    constructor(params?: Record<string, unknown>);
  }

  export class LineBasicMaterial extends Material {
    constructor(params?: Record<string, unknown>);
    color: Color;
  }

  export class Mesh extends Object3D {
    constructor(geometry?: BufferGeometry, material?: Material | Material[]);
    geometry: BufferGeometry;
    material: Material | Material[];
  }

  export class LineLoop extends Object3D {
    constructor(geometry?: BufferGeometry, material?: Material);
  }

  export class GridHelper extends Object3D {
    constructor(size?: number, divisions?: number, color1?: number, color2?: number);
  }

  export class AmbientLight extends Object3D {
    constructor(color?: number, intensity?: number);
  }

  export class DirectionalLight extends Object3D {
    constructor(color?: number, intensity?: number);
  }

  export class Box3 {
    constructor(min?: Vector3, max?: Vector3);
    max: Vector3;
    min: Vector3;
    getCenter(target: Vector3): Vector3;
    setFromObject(object: Object3D): this;
  }

  export class BoxHelper extends Object3D {
    constructor(object?: Object3D, color?: number);
    material: Material;
    update(): void;
  }

  export namespace MathUtils {
    function degToRad(degrees: number): number;
    function radToDeg(radians: number): number;
  }
}
