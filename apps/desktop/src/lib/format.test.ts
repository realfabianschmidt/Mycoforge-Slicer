import { describe, expect, it } from "vitest";
import { basename, dirname, fileExtension, formatRelativeTime } from "./format";

describe("path helpers", () => {
  it("basename handles both separators and trailing slashes", () => {
    expect(basename("H:\\models\\part.stl")).toBe("part.stl");
    expect(basename("/home/u/part.gcode")).toBe("part.gcode");
    expect(basename("H:\\models\\")).toBe("models");
    expect(basename("part.stl")).toBe("part.stl");
  });

  it("dirname returns the folder without trailing separator", () => {
    expect(dirname("H:\\models\\part.stl")).toBe("H:\\models");
    expect(dirname("/home/u/part.gcode")).toBe("/home/u");
    expect(dirname("part.stl")).toBe("");
  });

  it("fileExtension is lower-cased and dot-prefixed", () => {
    expect(fileExtension("PART.STL")).toBe(".stl");
    expect(fileExtension("a/b/job.GCode")).toBe(".gcode");
    expect(fileExtension("noext")).toBe("");
    expect(fileExtension(".hidden")).toBe("");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-05-22T14:46:00").getTime();

  it("labels the previous calendar day as Yesterday", () => {
    const yesterday = new Date("2026-05-21T09:00:00").getTime();
    expect(formatRelativeTime(yesterday, now)).toBe("Yesterday");
  });

  it("renders a short date for older timestamps", () => {
    const older = new Date("2026-05-12T09:00:00").getTime();
    expect(formatRelativeTime(older, now)).not.toBe("Yesterday");
    expect(formatRelativeTime(older, now).length).toBeGreaterThan(0);
  });

  it("renders clock time for same-day timestamps", () => {
    const earlier = new Date("2026-05-22T08:15:00").getTime();
    expect(formatRelativeTime(earlier, now)).toMatch(/\d/);
  });
});
