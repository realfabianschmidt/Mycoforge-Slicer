import { describe, expect, it } from "vitest";
import { DEFAULT_BED_VOLUME } from "./bed-volume";
import { DEFAULT_TRANSFORM } from "./model";
import {
  buildProcessGcodeArgs,
  buildSliceProcessArgs,
  transformForSlicerGeometry
} from "./slice-command";
import { defaultSliceSettings } from "./settings";

describe("slice command", () => {
  it("keeps placement out of the STL geometry transform", () => {
    const transform = {
      ...DEFAULT_TRANSFORM,
      translateXMm: 40,
      translateYMm: -15,
      translateZMm: 2,
      rotateXDeg: 90,
      rotateYDeg: 10,
      rotateZDeg: 45,
      scale: 1.5
    };

    expect(transformForSlicerGeometry(transform)).toEqual({
      ...transform,
      translateXMm: 0,
      translateYMm: 0,
      translateZMm: 0
    });
  });

  it("centers prepared STL geometry on the synced Klipper print envelope", () => {
    expect(transformForSlicerGeometry(DEFAULT_TRANSFORM, DEFAULT_BED_VOLUME)).toEqual({
      ...DEFAULT_TRANSFORM,
      translateXMm: 0,
      translateYMm: 0,
      translateZMm: 0,
      centerXMm: 165,
      centerYMm: 177.5
    });
  });

  it("passes layout transform JSON to slice-process for STL jobs", () => {
    const layoutTransform = {
      ...DEFAULT_TRANSFORM,
      translateXMm: 40,
      translateYMm: -15,
      rotateZDeg: 45
    };

    const args = buildSliceProcessArgs({
      modelPath: "prepared.stl",
      outputPath: "out.gcode",
      materialProfilePath: "profile.json",
      settings: defaultSliceSettings,
      layoutTransform,
      bedVolume: DEFAULT_BED_VOLUME
    });

    expect(args).toContain("--layout-transform-json");
    expect(args[args.indexOf("--layout-transform-json") + 1]).toBe(
      JSON.stringify(layoutTransform)
    );
    expect(args).not.toContain("--slicer-binary");
    expect(args).not.toContain("--slicer-profile");
    expect(args).toContain("--nozzle-diameter");
    expect(args[args.indexOf("--nozzle-diameter") + 1]).toBe(String(defaultSliceSettings.lineWidthMm));
    expect(args).toContain("--filter-short-extrusions");
    expect(args[args.indexOf("--min-extrusion-path") + 1]).toBe(
      String(defaultSliceSettings.minExtrusionPathMm)
    );
    expect(args[args.indexOf("--travel-speed") + 1]).toBe(
      String(defaultSliceSettings.travelSpeedMmS)
    );
    expect(args).toContain("--printer-geometry-json");
    const geometry = JSON.parse(args[args.indexOf("--printer-geometry-json") + 1]);
    expect(geometry.print_envelope.x).toEqual({ min_mm: 5, max_mm: 325 });
    expect(geometry.print_envelope.y).toEqual({ min_mm: 30, max_mm: 325 });
  });

  it("keeps optional slicer settings when configured", () => {
    const args = buildSliceProcessArgs({
      modelPath: "prepared.stl",
      outputPath: "out.gcode",
      materialProfilePath: "profile.json",
      settings: {
        ...defaultSliceSettings,
        slicerBinary: "orca.exe",
        slicerProfile: "profile.ini"
      }
    });

    expect(args).toContain("--slicer-binary");
    expect(args).toContain("orca.exe");
    expect(args).toContain("--slicer-profile");
    expect(args).toContain("profile.ini");
    expect(args).not.toContain("--layout-transform-json");
    expect(args[args.indexOf("--nozzle-diameter") + 1]).toBe(String(defaultSliceSettings.lineWidthMm));
  });

  it("can request printer nozzle sync through Moonraker", () => {
    const args = buildSliceProcessArgs({
      modelPath: "prepared.stl",
      outputPath: "out.gcode",
      materialProfilePath: "profile.json",
      settings: defaultSliceSettings,
      moonrakerUrl: "http://192.168.1.42:7125",
      syncPrinterNozzle: true
    });

    expect(args).toContain("--moonraker-url");
    expect(args[args.indexOf("--moonraker-url") + 1]).toBe("http://192.168.1.42:7125");
    expect(args).toContain("--sync-printer-nozzle");
  });

  it("passes paste options to process-gcode jobs", () => {
    const args = buildProcessGcodeArgs({
      inputPath: "input.gcode",
      outputPath: "out.gcode",
      materialProfilePath: "profile.json",
      settings: {
        ...defaultSliceSettings,
        filterShortExtrusions: false,
        minExtrusionPathMm: 9
      }
    });

    expect(args).toEqual([
      "process-gcode",
      "input.gcode",
      "--out",
      "out.gcode",
      "--profile",
      "profile.json",
      "--nozzle-diameter",
      String(defaultSliceSettings.lineWidthMm),
      "--no-filter-short-extrusions",
      "--min-extrusion-path",
      "9"
    ]);
  });

  it("omits --bed-mesh when the strategy is the default 'always'", () => {
    const sliceArgs = buildSliceProcessArgs({
      modelPath: "prepared.stl",
      outputPath: "out.gcode",
      materialProfilePath: "profile.json",
      settings: defaultSliceSettings
    });
    const processArgs = buildProcessGcodeArgs({
      inputPath: "in.gcode",
      outputPath: "out.gcode",
      materialProfilePath: "profile.json",
      settings: defaultSliceSettings
    });
    expect(sliceArgs).not.toContain("--bed-mesh");
    expect(processArgs).not.toContain("--bed-mesh");
  });

  it("emits --bed-mesh skip when the slicer is told to bypass calibration", () => {
    const args = buildSliceProcessArgs({
      modelPath: "prepared.stl",
      outputPath: "out.gcode",
      materialProfilePath: "profile.json",
      settings: { ...defaultSliceSettings, bedMeshMode: "skip" }
    });
    expect(args).toContain("--bed-mesh");
    expect(args[args.indexOf("--bed-mesh") + 1]).toBe("skip");
  });

  it("emits --bed-mesh load on process-gcode jobs too", () => {
    const args = buildProcessGcodeArgs({
      inputPath: "in.gcode",
      outputPath: "out.gcode",
      materialProfilePath: "profile.json",
      settings: { ...defaultSliceSettings, bedMeshMode: "load" }
    });
    expect(args).toContain("--bed-mesh");
    expect(args[args.indexOf("--bed-mesh") + 1]).toBe("load");
  });
});
