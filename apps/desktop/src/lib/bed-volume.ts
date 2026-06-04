import { useCallback, useState } from "react";

export type BedVolumeSource =
  | "default"
  | "manual"
  | "printer"
  | "myco_geometry"
  | "toolhead"
  | "configfile";

export interface AxisEnvelope {
  minMm: number;
  maxMm: number;
}

export interface GeometryEnvelope {
  x: AxisEnvelope;
  y: AxisEnvelope;
  z: AxisEnvelope;
}

export interface BedVolume {
  sizeXMm: number;
  sizeYMm: number;
  heightZMm: number;
  minXMm: number;
  maxXMm: number;
  minYMm: number;
  maxYMm: number;
  minZMm: number;
  maxZMm: number;
  printEnvelope: GeometryEnvelope;
  moveEnvelope?: GeometryEnvelope;
  kinematics?: string;
  source: BedVolumeSource;
}

/** Mycoforge Klipper SoT fallback, matching _myco_geometry on 2026-05-27. */
export const DEFAULT_BED_VOLUME: BedVolume = createBedVolume({
  printEnvelope: envelope(5, 325, 30, 325, 0, 160),
  moveEnvelope: envelope(0, 335, 30, 335, 0, 160),
  source: "default"
});

const STORAGE_KEY = "mycoforge.bed_volume";
const SCHEMA_VERSION = 2;

interface StoredBedVolume {
  schemaVersion: 2;
  printEnvelope: GeometryEnvelope;
  moveEnvelope?: GeometryEnvelope;
  kinematics?: string;
  source: BedVolumeSource;
}

export function loadBedVolume(storage: Pick<Storage, "getItem">): BedVolume {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BED_VOLUME;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return DEFAULT_BED_VOLUME;
    if (parsed.schemaVersion !== SCHEMA_VERSION) return DEFAULT_BED_VOLUME;
    const printEnvelope = readEnvelope(parsed.printEnvelope);
    if (!printEnvelope) return DEFAULT_BED_VOLUME;
    const moveEnvelope = readEnvelope(parsed.moveEnvelope) ?? undefined;
    return createBedVolume({
      printEnvelope,
      moveEnvelope,
      kinematics: typeof parsed.kinematics === "string" ? parsed.kinematics : undefined,
      source: sourceFor(parsed.source)
    });
  } catch {
    return DEFAULT_BED_VOLUME;
  }
}

export function saveBedVolume(
  storage: Pick<Storage, "setItem">,
  volume: BedVolume
): void {
  const stored: StoredBedVolume = {
    schemaVersion: SCHEMA_VERSION,
    printEnvelope: volume.printEnvelope,
    moveEnvelope: volume.moveEnvelope,
    kinematics: volume.kinematics,
    source: volume.source
  };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    /* Persisting bed volume is best-effort. */
  }
}

export function useBedVolume() {
  const [volume, setVolumeState] = useState<BedVolume>(() => loadBedVolume(window.localStorage));

  const setVolume = useCallback((next: BedVolume) => {
    saveBedVolume(window.localStorage, next);
    setVolumeState(next);
  }, []);

  return { volume, setVolume };
}

export function createBedVolume(input: {
  printEnvelope: GeometryEnvelope;
  moveEnvelope?: GeometryEnvelope;
  kinematics?: string;
  source: BedVolumeSource;
}): BedVolume {
  return {
    sizeXMm: round(input.printEnvelope.x.maxMm - input.printEnvelope.x.minMm),
    sizeYMm: round(input.printEnvelope.y.maxMm - input.printEnvelope.y.minMm),
    heightZMm: round(input.printEnvelope.z.maxMm - input.printEnvelope.z.minMm),
    minXMm: input.printEnvelope.x.minMm,
    maxXMm: input.printEnvelope.x.maxMm,
    minYMm: input.printEnvelope.y.minMm,
    maxYMm: input.printEnvelope.y.maxMm,
    minZMm: input.printEnvelope.z.minMm,
    maxZMm: input.printEnvelope.z.maxMm,
    printEnvelope: input.printEnvelope,
    moveEnvelope: input.moveEnvelope,
    kinematics: input.kinematics,
    source: input.source
  };
}

export function bedCenterXMm(volume: BedVolume): number {
  return (volume.minXMm + volume.maxXMm) / 2;
}

export function bedCenterYMm(volume: BedVolume): number {
  return (volume.minYMm + volume.maxYMm) / 2;
}

export function bedVolumeToPrinterGeometry(volume: BedVolume): Record<string, unknown> {
  return {
    bed_size_x_mm: volume.sizeXMm,
    bed_size_y_mm: volume.sizeYMm,
    bed_height_z_mm: volume.heightZMm,
    min_x_mm: volume.minXMm,
    max_x_mm: volume.maxXMm,
    min_y_mm: volume.minYMm,
    max_y_mm: volume.maxYMm,
    min_z_mm: volume.minZMm,
    max_z_mm: volume.maxZMm,
    print_envelope: envelopeForCli(volume.printEnvelope),
    move_envelope: volume.moveEnvelope ? envelopeForCli(volume.moveEnvelope) : undefined,
    kinematics: volume.kinematics,
    source: volume.source
  };
}

export function formatBedVolume(volume: BedVolume): string {
  const fmt = (value: number) =>
    Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${fmt(volume.sizeXMm)}x${fmt(volume.sizeYMm)}x${fmt(volume.heightZMm)} mm`;
}

export function envelope(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number
): GeometryEnvelope {
  return {
    x: { minMm: minX, maxMm: maxX },
    y: { minMm: minY, maxMm: maxY },
    z: { minMm: minZ, maxMm: maxZ }
  };
}

function readEnvelope(value: unknown): GeometryEnvelope | null {
  if (!isRecord(value)) return null;
  const x = readAxis(value.x);
  const y = readAxis(value.y);
  const z = readAxis(value.z);
  if (!x || !y || !z) return null;
  return { x, y, z };
}

function readAxis(value: unknown): AxisEnvelope | null {
  if (!isRecord(value)) return null;
  const min = finiteNumber(value.minMm ?? value.min_mm);
  const max = finiteNumber(value.maxMm ?? value.max_mm);
  if (min === null || max === null || max <= min) return null;
  return { minMm: min, maxMm: max };
}

function envelopeForCli(value: GeometryEnvelope) {
  return {
    x: { min_mm: value.x.minMm, max_mm: value.x.maxMm },
    y: { min_mm: value.y.minMm, max_mm: value.y.maxMm },
    z: { min_mm: value.z.minMm, max_mm: value.z.maxMm }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function sourceFor(value: unknown): BedVolumeSource {
  if (
    value === "manual" ||
    value === "printer" ||
    value === "myco_geometry" ||
    value === "toolhead" ||
    value === "configfile"
  ) {
    return value;
  }
  return "default";
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
