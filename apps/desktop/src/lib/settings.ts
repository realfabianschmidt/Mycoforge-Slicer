export type RetractionStrength = "soft" | "normal" | "strong";

/**
 * Klipper bed-mesh strategy emitted into the START_PRINT line. The macro on
 * the printer (apply_nozzle_sync.py START_PRINT_BLOCK) reads this and either
 * calibrates, loads a saved mesh, or skips the mesh entirely.
 */
export type BedMeshMode = "always" | "load" | "skip";

export const BED_MESH_MODES: readonly BedMeshMode[] = ["always", "load", "skip"];

export interface SliceSettingsState {
  lineWidthMm: number;
  layerHeightMm: number;
  printSpeedMmS: number;
  vaseMode: boolean;
  smoothVase: boolean;
  filterShortExtrusions: boolean;
  minExtrusionPathMm: number;
  travelSpeedMmS: number;
  wallLoops: number;
  topShellLayers: number;
  bottomShellLayers: number;
  infillDensityPercent: number;
  retractionStrength: RetractionStrength;
  slicerBinary: string;
  slicerProfile: string;
  bedMeshMode: BedMeshMode;
}

export interface MaterialProfile {
  id: string;
  name: string;
  profile_path: string;
  line_width_mm: number;
  layer_height_mm: number;
  print_speed_mm_s: number;
  travel_speed_mm_s: number;
}

export interface SlicerResolution {
  state: string;
  source: string | null;
  path: string | null;
  version?: string | null;
  name?: string | null;
}

export const fallbackMaterials: MaterialProfile[] = [
  {
    id: "mycelium_default",
    name: "Mycelium Default",
    profile_path: "profiles/materials/mycelium_default.json",
    line_width_mm: 5,
    layer_height_mm: 2,
    print_speed_mm_s: 15,
    travel_speed_mm_s: 80
  }
];

export const defaultSliceSettings: SliceSettingsState = {
  lineWidthMm: 5,
  layerHeightMm: 2,
  printSpeedMmS: 15,
  vaseMode: false,
  smoothVase: true,
  filterShortExtrusions: true,
  minExtrusionPathMm: 7.5,
  travelSpeedMmS: 80,
  wallLoops: 3,
  topShellLayers: 3,
  bottomShellLayers: 3,
  infillDensityPercent: 15,
  retractionStrength: "normal",
  slicerBinary: "",
  slicerProfile: "",
  bedMeshMode: "always"
};

export function defaultMinExtrusionPathMm(lineWidthMm: number): number {
  return Math.max(5, lineWidthMm * 1.5);
}

export function outputPathFor(inputPath: string): string {
  if (!inputPath) return "";
  const dot = inputPath.lastIndexOf(".");
  if (dot === -1) return `${inputPath}_mycoforge.gcode`;
  return `${inputPath.slice(0, dot)}_mycoforge.gcode`;
}
