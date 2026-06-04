import { describe, expect, it } from "vitest";
import { extractCliError } from "./use-cli-runner";

describe("extractCliError", () => {
  it("summarizes nested slice JSON errors", () => {
    const stdout = JSON.stringify({
      ok: false,
      stage: "slice",
      slice: {
        error: "OrcaSlicer failed before producing G-code.",
        stderr: "Invalid option\n",
        stdout: ""
      }
    });

    expect(extractCliError(stdout, "")).toBe(
      "stage=slice: OrcaSlicer failed before producing G-code.: Invalid option"
    );
  });

  it("falls back to stderr when stdout is not JSON", () => {
    expect(extractCliError("", "bad flags\nmore")).toBe("bad flags");
  });
});
