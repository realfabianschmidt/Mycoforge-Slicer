// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PrinterControlView } from "./PrinterControlView";

describe("PrinterControlView", () => {
  afterEach(() => cleanup());

  it("renders the configured printer-control URL in an embedded iframe", () => {
    render(
      <PrinterControlView
        url="http://192.168.178.61:8080/"
        error=""
        onSettingsClick={() => undefined}
      />
    );

    const frame = screen.getByTitle("Printer Control");

    expect(frame.getAttribute("src")).toBe("http://192.168.178.61:8080/");
    expect(frame.getAttribute("data-reload-id")).toBe("0");
  });

  it("refreshes the embedded view when reload is pressed", () => {
    render(
      <PrinterControlView
        url="http://192.168.178.61:8080/"
        error=""
        onSettingsClick={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Reload" }));

    expect(screen.getByTitle("Printer Control").getAttribute("data-reload-id")).toBe("1");
  });

  it("shows a styled error state when the control URL is invalid", () => {
    render(
      <PrinterControlView
        url="http://192.168.178.61:8080/"
        error="Control URL failed"
        onSettingsClick={() => undefined}
      />
    );

    expect(screen.queryByTitle("Printer Control")).toBeNull();
    expect(screen.getByText("Printer control unavailable")).toBeTruthy();
    expect(screen.getByText("Control URL failed")).toBeTruthy();
  });
});
