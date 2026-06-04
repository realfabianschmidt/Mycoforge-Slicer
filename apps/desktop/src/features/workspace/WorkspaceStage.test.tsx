// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE_MODE,
  WorkspaceStage,
  type WorkspaceMode
} from "./WorkspaceStage";

function WorkspaceHarness() {
  const [mode, setMode] = useState<WorkspaceMode>(DEFAULT_WORKSPACE_MODE);
  return (
    <WorkspaceStage
      mode={mode}
      controlUrl="http://192.168.178.61:8080/"
      controlError=""
      onModeChange={setMode}
      onPrinterSettingsClick={() => undefined}
    >
      <div data-testid="slicer-workspace">Slicer canvas</div>
    </WorkspaceStage>
  );
}

describe("WorkspaceStage", () => {
  afterEach(() => cleanup());

  it("renders the slicer workspace first and switches to printer control", () => {
    render(<WorkspaceHarness />);

    expect(screen.getByTestId("slicer-workspace")).toBeTruthy();
    expect(screen.queryByTitle("Printer Control")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Printer" }));

    expect(screen.queryByTestId("slicer-workspace")).toBeNull();
    const frame = screen.getByTitle("Printer Control");
    expect(frame.getAttribute("src")).toBe("http://192.168.178.61:8080/");
    expect(frame.closest(".workspace")?.className).toContain("workspace--printer");
  });
});
