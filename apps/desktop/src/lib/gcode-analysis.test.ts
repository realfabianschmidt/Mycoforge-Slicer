import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeGCode, filterGCodeForPreview } from "./gcode-analysis";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(here, "../../../../tests/fixtures");

function fixture(name: string) {
  return readFileSync(resolve(fixtureRoot, name), "utf-8");
}

describe("gcodeAnalysis", () => {
  it("counts extrusion, travel, retract and prime moves", () => {
    const stats = analyzeGCode(fixture("retract_travel_prime.gcode"), 5);

    expect(stats.extrusionMoves).toBe(2);
    expect(stats.travelMoves).toBe(1);
    expect(stats.retracts).toBe(1);
    expect(stats.primes).toBe(1);
    expect(stats.events).toHaveLength(2);
    expect(stats.minFeedrate).toBe(600);
    expect(stats.maxFeedrate).toBe(6000);
  });

  it("filters travel and extrusion independently", () => {
    const gcode = fixture("retract_travel_prime.gcode");
    const withoutTravel = filterGCodeForPreview(gcode, {
      showExtrusion: true,
      showTravel: false,
      showRetractPrime: true
    });
    const withoutExtrusion = filterGCodeForPreview(gcode, {
      showExtrusion: false,
      showTravel: true,
      showRetractPrime: true
    });

    expect(withoutTravel).not.toContain("G0 X100 Y100 F6000");
    expect(withoutTravel).toContain("G1 X10 Y10 E1.000 F900");
    expect(withoutExtrusion).toContain("G0 X100 Y100 F6000");
    expect(withoutExtrusion).not.toContain("G1 X10 Y10 E1.000 F900");
  });

  it("detects macro translated retract and prime events", () => {
    const stats = analyzeGCode(
      [
        "G1 X10 Y10 E1.0 F900",
        "MYCO_RETRACT AMOUNT=1.2 SPEED=600 MODE=pcp_pressure_relief",
        "G0 X20 Y20 F6000",
        "MYCO_PRIME AMOUNT=1.25 SPEED=600 MODE=controlled"
      ].join("\n")
    );

    expect(stats.retracts).toBe(1);
    expect(stats.primes).toBe(1);
    expect(stats.events.map((event) => event.type)).toEqual(["retract", "prime"]);
  });
});
