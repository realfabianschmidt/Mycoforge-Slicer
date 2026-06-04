import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { LineColorizer } from "gcode-viewer/dist-esm/SegmentColorizer.js";

describe("three runtime", () => {
  it("uses the same Color constructor for gcode-viewer colorizers and the app", () => {
    const colorizer = new LineColorizer([], {});
    const color = colorizer.getColor({ gCodeLine: 1, speed: 0, temp: 0 });

    expect(color).toBeInstanceOf(THREE.Color);
  });
});
