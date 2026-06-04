// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WORKSPACE_MODE, WorkspaceSwitcher } from "./WorkspaceSwitcher";

describe("WorkspaceSwitcher", () => {
  afterEach(() => cleanup());

  it("defaults the shell workspace to slicer", () => {
    expect(DEFAULT_WORKSPACE_MODE).toBe("slicer");
  });

  it("selects the printer workspace", () => {
    const onModeChange = vi.fn();
    render(<WorkspaceSwitcher mode="slicer" onModeChange={onModeChange} />);

    expect(screen.getByRole("button", { name: "Slicer" }).getAttribute("aria-pressed")).toBe(
      "true"
    );

    fireEvent.click(screen.getByRole("button", { name: "Printer" }));

    expect(onModeChange).toHaveBeenCalledWith("printer");
  });
});
