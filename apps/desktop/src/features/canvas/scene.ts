import * as THREE from "three";
import { bedCenterXMm, bedCenterYMm, type BedVolume } from "../../lib/bed-volume";

export const CANVAS_BG = 0xf0f2f5;
export const BED_ACCENT = 0x0055ff;

export interface ModelBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  valid: boolean;
}

export function createBuildPlate(volume: BedVolume): THREE.Group {
  const group = new THREE.Group();
  const sizeX = volume.sizeXMm;
  const sizeY = volume.sizeYMm;
  const centerX = bedCenterXMm(volume);
  const centerY = bedCenterYMm(volume);
  // Pick the divisions so each cell is roughly the same on either axis.
  const divisionsX = Math.max(2, Math.round(sizeX / 25));
  const divisions = Math.max(divisionsX, Math.round(sizeY / 25));

  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(sizeX, sizeY),
    new THREE.MeshBasicMaterial({ color: 0xf8fbff, side: THREE.DoubleSide })
  );
  plate.position.set(centerX, centerY, -0.04);
  group.add(plate);

  // GridHelper is square; we use the larger axis and shape it with scale to avoid
  // distorting the grid spacing on non-square beds.
  const longest = Math.max(sizeX, sizeY);
  const grid = new THREE.GridHelper(longest, divisions, 0x8da2bd, 0xcbd5e1);
  grid.rotation.x = Math.PI / 2;
  grid.position.set(centerX, centerY, 0.02);
  group.add(grid);

  const border = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(volume.minXMm, volume.minYMm, 0.05),
      new THREE.Vector3(volume.maxXMm, volume.minYMm, 0.05),
      new THREE.Vector3(volume.maxXMm, volume.maxYMm, 0.05),
      new THREE.Vector3(volume.minXMm, volume.maxYMm, 0.05)
    ]),
    new THREE.LineBasicMaterial({ color: BED_ACCENT })
  );
  group.add(border);
  return group;
}

export function addSceneLights(scene: THREE.Scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 1.8));
  const light = new THREE.DirectionalLight(0xffffff, 1.7);
  light.position.set(120, -160, 260);
  scene.add(light);
}

export function configurePlateCamera(
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  volume: BedVolume
) {
  const centerX = bedCenterXMm(volume);
  const centerY = bedCenterYMm(volume);
  // Pull the camera back proportionally so larger beds stay framed.
  const reach = Math.max(volume.sizeXMm, volume.sizeYMm);
  camera.up.set(0, 0, 1);
  camera.aspect = width / height;
  camera.near = 0.1;
  camera.far = reach * 8;
  camera.position.set(reach * 0.72, -reach * 0.92, reach * 0.66);
  camera.lookAt(centerX, centerY, 20);
  camera.updateProjectionMatrix();
}

export function createBoundsHelper(object: THREE.Object3D): THREE.BoxHelper {
  return new THREE.BoxHelper(object, 0x0b57d0);
}

export function measureModelBounds(object: THREE.Object3D, volume: BedVolume): ModelBounds {
  const box = new THREE.Box3().setFromObject(object);
  const valid =
    box.min.x >= volume.minXMm &&
    box.max.x <= volume.maxXMm &&
    box.min.y >= volume.minYMm &&
    box.max.y <= volume.maxYMm &&
    box.min.z >= volume.minZMm - 0.001 &&
    box.max.z <= volume.maxZMm;

  return {
    minX: box.min.x,
    maxX: box.max.x,
    minY: box.min.y,
    maxY: box.max.y,
    minZ: box.min.z,
    maxZ: box.max.z,
    valid
  };
}

export function boundsSummary(bounds: ModelBounds | null): string {
  if (!bounds) return "";
  return `${format(bounds.maxX - bounds.minX)} x ${format(bounds.maxY - bounds.minY)} x ${format(
    bounds.maxZ - bounds.minZ
  )} mm`;
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
