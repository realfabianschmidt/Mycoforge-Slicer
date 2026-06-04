import type { ModelTransform } from "./api";
import { DEFAULT_BED_VOLUME, type BedVolume } from "./bed-volume";
import { fileExtension } from "./format";

/** Fallback build-plate edge length — used until the printer reports its volume. */
export const DEFAULT_BED_SIZE_MM = DEFAULT_BED_VOLUME.sizeXMm;
export const DEFAULT_BED_HEIGHT_MM = DEFAULT_BED_VOLUME.heightZMm;
export const MIN_MODEL_SCALE = 0.05;
export const MAX_MODEL_SCALE = 10;

export type PlacementTool = "move" | "rotate" | "scale";
export type TransformSpace = "world" | "local";

/** Neutral placement: centred, unrotated. */
export const DEFAULT_TRANSFORM: ModelTransform = {
  translateXMm: 0,
  translateYMm: 0,
  translateZMm: 0,
  rotateXDeg: 0,
  rotateYDeg: 0,
  rotateZDeg: 0,
  scale: 1
};

export function isStlPath(path: string): boolean {
  return fileExtension(path) === ".stl";
}

export function isGcodePath(path: string): boolean {
  return fileExtension(path) === ".gcode";
}

/** Keep a plate offset within ± half the bed. */
export function clampBed(value: number, sizeMm: number = DEFAULT_BED_SIZE_MM): number {
  const half = sizeMm / 2;
  return Math.max(-half, Math.min(half, value));
}

export function clampZ(value: number, heightMm: number = DEFAULT_BED_HEIGHT_MM): number {
  return Math.max(0, Math.min(heightMm, value));
}

export function clampScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(MIN_MODEL_SCALE, Math.min(MAX_MODEL_SCALE, value));
}

/** Wrap an angle into [0, 360). */
export function normalizeDegrees(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function normalizeTransform(
  transform: ModelTransform,
  volume: BedVolume = DEFAULT_BED_VOLUME
): ModelTransform {
  return {
    translateXMm: clampBed(transform.translateXMm, volume.sizeXMm),
    translateYMm: clampBed(transform.translateYMm, volume.sizeYMm),
    translateZMm: clampZ(transform.translateZMm, volume.heightZMm),
    rotateXDeg: normalizeDegrees(transform.rotateXDeg),
    rotateYDeg: normalizeDegrees(transform.rotateYDeg),
    rotateZDeg: normalizeDegrees(transform.rotateZDeg),
    scale: clampScale(transform.scale)
  };
}

export function sameTransform(left: ModelTransform, right: ModelTransform): boolean {
  return (
    nearlyEqual(left.translateXMm, right.translateXMm) &&
    nearlyEqual(left.translateYMm, right.translateYMm) &&
    nearlyEqual(left.translateZMm, right.translateZMm) &&
    nearlyEqual(left.rotateXDeg, right.rotateXDeg) &&
    nearlyEqual(left.rotateYDeg, right.rotateYDeg) &&
    nearlyEqual(left.rotateZDeg, right.rotateZDeg) &&
    nearlyEqual(left.scale, right.scale)
  );
}

/** Compact numeric string for transform input fields. */
export function formatTransformInput(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.0001;
}
