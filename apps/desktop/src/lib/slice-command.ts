import type { ModelTransform } from "./api";
import {
  bedCenterXMm,
  bedCenterYMm,
  bedVolumeToPrinterGeometry,
  type BedVolume
} from "./bed-volume";
import type { SliceSettingsState } from "./settings";

export interface SliceProcessArgsInput {
  modelPath: string;
  outputPath: string;
  materialProfilePath: string;
  settings: SliceSettingsState;
  layoutTransform?: ModelTransform;
  bedVolume?: BedVolume;
  moonrakerUrl?: string;
  syncPrinterNozzle?: boolean;
}

export interface ProcessGcodeArgsInput {
  inputPath: string;
  outputPath: string;
  materialProfilePath: string;
  settings: SliceSettingsState;
}

export function buildSliceProcessArgs(input: SliceProcessArgsInput): string[] {
  const args = [
    "slice-process",
    input.modelPath,
    "--out",
    input.outputPath,
    "--profile",
    input.materialProfilePath,
    "--line-width",
    String(input.settings.lineWidthMm),
    "--layer-height",
    String(input.settings.layerHeightMm),
    "--print-speed",
    String(input.settings.printSpeedMmS),
    "--nozzle-diameter",
    String(input.settings.lineWidthMm),
    input.settings.vaseMode ? "--vase-mode" : "--no-vase-mode",
    input.settings.smoothVase ? "--smooth-vase" : "--no-smooth-vase",
    input.settings.filterShortExtrusions
      ? "--filter-short-extrusions"
      : "--no-filter-short-extrusions",
    "--min-extrusion-path",
    String(input.settings.minExtrusionPathMm),
    "--travel-speed",
    String(input.settings.travelSpeedMmS),
    "--wall-loops",
    String(input.settings.wallLoops),
    "--top-shell-layers",
    String(input.settings.topShellLayers),
    "--bottom-shell-layers",
    String(input.settings.bottomShellLayers),
    "--infill-density",
    String(input.settings.infillDensityPercent)
  ];

  if (input.settings.slicerBinary) {
    args.push("--slicer-binary", input.settings.slicerBinary);
  }
  if (input.settings.slicerProfile) {
    args.push("--slicer-profile", input.settings.slicerProfile);
  }
  if (input.layoutTransform) {
    args.push("--layout-transform-json", JSON.stringify(input.layoutTransform));
  }
  if (input.bedVolume) {
    args.push("--printer-geometry-json", JSON.stringify(bedVolumeToPrinterGeometry(input.bedVolume)));
  }
  if (input.syncPrinterNozzle) {
    if (input.moonrakerUrl) {
      args.push("--moonraker-url", input.moonrakerUrl);
    }
    args.push("--sync-printer-nozzle");
  }
  if (input.settings.bedMeshMode && input.settings.bedMeshMode !== "always") {
    args.push("--bed-mesh", input.settings.bedMeshMode);
  }

  return args;
}

export function buildProcessGcodeArgs(input: ProcessGcodeArgsInput): string[] {
  const args = [
    "process-gcode",
    input.inputPath,
    "--out",
    input.outputPath,
    "--profile",
    input.materialProfilePath,
    "--nozzle-diameter",
    String(input.settings.lineWidthMm),
    input.settings.filterShortExtrusions
      ? "--filter-short-extrusions"
      : "--no-filter-short-extrusions",
    "--min-extrusion-path",
    String(input.settings.minExtrusionPathMm)
  ];
  if (input.settings.bedMeshMode && input.settings.bedMeshMode !== "always") {
    args.push("--bed-mesh", input.settings.bedMeshMode);
  }
  return args;
}

export function transformForSlicerGeometry(
  transform: ModelTransform,
  volume?: BedVolume
): ModelTransform {
  const prepared: ModelTransform = {
    ...transform,
    translateXMm: 0,
    translateYMm: 0,
    translateZMm: 0
  };
  if (!volume) return prepared;
  return {
    ...prepared,
    centerXMm: bedCenterXMm(volume),
    centerYMm: bedCenterYMm(volume)
  };
}
