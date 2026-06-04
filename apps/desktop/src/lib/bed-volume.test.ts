import { describe, expect, it } from "vitest";
import {
  DEFAULT_BED_VOLUME,
  envelope,
  loadBedVolume,
  saveBedVolume,
  type BedVolume
} from "./bed-volume";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("bed-volume storage", () => {
  it("returns the Mycoforge print-envelope default when nothing is stored", () => {
    const storage = new MemoryStorage();
    expect(loadBedVolume(storage)).toEqual(DEFAULT_BED_VOLUME);
    expect(DEFAULT_BED_VOLUME.sizeXMm).toBe(320);
    expect(DEFAULT_BED_VOLUME.sizeYMm).toBe(295);
    expect(DEFAULT_BED_VOLUME.heightZMm).toBe(160);
    expect(DEFAULT_BED_VOLUME.minXMm).toBe(5);
    expect(DEFAULT_BED_VOLUME.minYMm).toBe(30);
  });

  it("round-trips a Mycoforge geometry volume through localStorage", () => {
    const storage = new MemoryStorage();
    const volume: BedVolume = {
      sizeXMm: 320,
      sizeYMm: 295,
      heightZMm: 160,
      minXMm: 5,
      maxXMm: 325,
      minYMm: 30,
      maxYMm: 325,
      minZMm: 0,
      maxZMm: 160,
      printEnvelope: envelope(5, 325, 30, 325, 0, 160),
      moveEnvelope: envelope(0, 335, 30, 335, 0, 160),
      kinematics: "corexy",
      source: "myco_geometry"
    };
    saveBedVolume(storage, volume);
    expect(loadBedVolume(storage)).toEqual(volume);
  });

  it("falls back to the default when stored JSON is malformed", () => {
    const storage = new MemoryStorage();
    storage.setItem("mycoforge.bed_volume", "{not json");
    expect(loadBedVolume(storage)).toEqual(DEFAULT_BED_VOLUME);
  });

  it("falls back to the default when the schema version is unknown", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "mycoforge.bed_volume",
      JSON.stringify({ schemaVersion: 99, sizeXMm: 1, sizeYMm: 1, heightZMm: 1, source: "printer" })
    );
    expect(loadBedVolume(storage)).toEqual(DEFAULT_BED_VOLUME);
  });

  it("falls back to the default when the stored print envelope is invalid", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "mycoforge.bed_volume",
      JSON.stringify({
        schemaVersion: 2,
        printEnvelope: envelope(5, 5, 30, 325, 0, 160),
        source: "myco_geometry"
      })
    );
    expect(loadBedVolume(storage)).toEqual(DEFAULT_BED_VOLUME);
  });

  it("coerces unknown source values back to default", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "mycoforge.bed_volume",
      JSON.stringify({
        schemaVersion: 2,
        printEnvelope: envelope(5, 325, 30, 325, 0, 160),
        source: "bogus"
      })
    );
    expect(loadBedVolume(storage).source).toBe("default");
  });
});
