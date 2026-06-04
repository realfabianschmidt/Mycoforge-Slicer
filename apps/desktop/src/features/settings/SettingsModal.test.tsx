// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validatePrinterDraft } from "../../lib/printer-settings";
import { SettingsModal, type PrinterDiscoveryCandidate } from "./SettingsModal";

const candidate: PrinterDiscoveryCandidate = {
  host: "192.168.178.61",
  label: "mycoforge (192.168.178.61)",
  moonrakerUrl: "http://192.168.178.61:7125",
  controlUrl: "http://192.168.178.61:8080/",
  moonrakerOk: true,
  controlOk: true
};

function renderModal(overrides: Partial<ComponentProps<typeof SettingsModal>> = {}) {
  const draft = { hostInput: "printer.local", moonrakerPort: "7125", controlPort: "8080" };
  return render(
    <SettingsModal
      open
      onClose={() => undefined}
      draft={draft}
      draftResult={validatePrinterDraft(draft)}
      candidates={[]}
      discoveryMessage=""
      isBusy={false}
      activeLabel={null}
      savedHost="printer.local"
      printerOnline={null}
      onDraftChange={() => undefined}
      onSearch={() => undefined}
      onTest={() => undefined}
      onUseCandidate={() => undefined}
      onSavePrinter={() => undefined}
      slicerResolution={{
        state: "installed",
        source: "managed",
        path: "/orca",
        version: "2.0"
      }}
      customPath=""
      onCustomPathChange={() => undefined}
      onInstallOrca={() => undefined}
      onSetCustom={() => undefined}
      onTestSlicer={() => undefined}
      bedMeshMode="always"
      onBedMeshModeChange={() => undefined}
      accent="orange"
      onAccentChange={() => undefined}
      {...overrides}
    />
  );
}

describe("SettingsModal", () => {
  afterEach(() => cleanup());

  it("renders the printer tab with derived URLs by default", () => {
    renderModal();
    expect(screen.getByText("http://printer.local:7125")).toBeTruthy();
    expect(screen.getByText("http://printer.local:8080/")).toBeTruthy();
  });

  it("lets the user pick a discovered printer and save", () => {
    const onUseCandidate = vi.fn();
    const onSavePrinter = vi.fn();
    renderModal({ candidates: [candidate], onUseCandidate, onSavePrinter });

    fireEvent.click(screen.getByRole("button", { name: "Use" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onUseCandidate).toHaveBeenCalledWith(candidate);
    expect(onSavePrinter).toHaveBeenCalled();
  });

  it("opens directly on the slicer tab when requested", () => {
    renderModal({ defaultTab: "slicer" });
    expect(screen.getByText(/OrcaSlicer/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Install Orca/ })).toBeTruthy();
  });

  it("surfaces accent picks through onAccentChange", () => {
    const onAccentChange = vi.fn();
    renderModal({ defaultTab: "appearance", onAccentChange });

    fireEvent.click(screen.getByRole("button", { name: "Blue" }));

    expect(onAccentChange).toHaveBeenCalledWith("blue");
  });

  it("emits the chosen bed-mesh strategy from the Slicer tab", () => {
    const onBedMeshModeChange = vi.fn();
    renderModal({ defaultTab: "slicer", onBedMeshModeChange });

    fireEvent.click(screen.getByRole("radio", { name: "Skip mesh" }));
    expect(onBedMeshModeChange).toHaveBeenCalledWith("skip");
  });
});
