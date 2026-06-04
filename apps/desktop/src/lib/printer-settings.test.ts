import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONTROL_PORT,
  DEFAULT_MOONRAKER_PORT,
  PRINTER_NOT_CONFIGURED,
  loadPrinterSettings,
  normalizeMoonrakerUrl,
  normalizePrinterControlUrl,
  savePrinterSettings,
  validatePrinterDraft
} from "./printer-settings";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("printer settings", () => {
  it("starts unconfigured instead of using a hardcoded printer IP", () => {
    const loaded = loadPrinterSettings(new MemoryStorage());

    expect(loaded.configured).toBe(false);
    expect(loaded.error).toBe(PRINTER_NOT_CONFIGURED);
    expect(loaded.moonrakerUrl).toBe("");
    expect(loaded.controlUrl).toBe("");
    expect(loaded.moonrakerPort).toBe(DEFAULT_MOONRAKER_PORT);
    expect(loaded.controlPort).toBe(DEFAULT_CONTROL_PORT);
  });

  it("derives Moonraker and control URLs from one host plus ports", () => {
    const result = validatePrinterDraft({
      hostInput: "192.168.178.61",
      moonrakerPort: "7125",
      controlPort: "8080"
    });

    expect(result.configured).toBe(true);
    expect(result.host).toBe("192.168.178.61");
    expect(result.moonrakerUrl).toBe("http://192.168.178.61:7125");
    expect(result.controlUrl).toBe("http://192.168.178.61:8080/");
  });

  it("accepts full URLs while keeping only the host as source of truth", () => {
    const result = validatePrinterDraft({
      hostInput: "http://printer.local:7125/api",
      moonrakerPort: "7125",
      controlPort: "8080"
    });

    expect(result.configured).toBe(true);
    expect(result.host).toBe("printer.local");
    expect(result.moonrakerUrl).toBe("http://printer.local:7125");
    expect(result.controlUrl).toBe("http://printer.local:8080/");
  });

  it("validates host and ports", () => {
    expect(validatePrinterDraft({ hostInput: "", moonrakerPort: "7125", controlPort: "8080" }).error).toBe(
      PRINTER_NOT_CONFIGURED
    );
    expect(
      validatePrinterDraft({
        hostInput: "http://bad host",
        moonrakerPort: "7125",
        controlPort: "8080"
      }).hostError
    ).toBe("Printer host must not contain spaces.");
    expect(
      validatePrinterDraft({
        hostInput: "printer.local",
        moonrakerPort: "0",
        controlPort: "8080"
      }).moonrakerPortError
    ).toBe("Moonraker port must be between 1 and 65535.");
  });

  it("loads and saves schema v2 printer settings", () => {
    const storage = new MemoryStorage();
    const saved = savePrinterSettings(storage, {
      hostInput: "printer.local",
      moonrakerPort: "7126",
      controlPort: "8081"
    });

    expect(saved.configured).toBe(true);
    expect(loadPrinterSettings(storage).moonrakerUrl).toBe("http://printer.local:7126");
    expect(loadPrinterSettings(storage).controlUrl).toBe("http://printer.local:8081/");
  });

  it("migrates legacy Moonraker and control URL settings", () => {
    const storage = new MemoryStorage();
    storage.setItem("mycoforge.printer", JSON.stringify({ moonrakerUrl: "http://192.168.1.50:7125" }));
    storage.setItem(
      "mycoforge.printerControl",
      JSON.stringify({ controlUrl: "http://192.168.1.50:8080/" })
    );

    const loaded = loadPrinterSettings(storage);

    expect(loaded.configured).toBe(true);
    expect(loaded.host).toBe("192.168.1.50");
    expect(loaded.moonrakerPort).toBe("7125");
    expect(loaded.controlPort).toBe("8080");
  });

  it("falls back to legacy control URL when Moonraker settings are missing", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "mycoforge.printerControl",
      JSON.stringify({ controlUrl: "http://mycoforge.local:8080/" })
    );

    const loaded = loadPrinterSettings(storage);

    expect(loaded.configured).toBe(true);
    expect(loaded.host).toBe("mycoforge.local");
    expect(loaded.moonrakerUrl).toBe("http://mycoforge.local:7125");
  });

  it("keeps URL normalization helpers for command inputs", () => {
    expect(normalizeMoonrakerUrl("192.168.1.42").url).toBe("http://192.168.1.42:7125");
    expect(normalizePrinterControlUrl("192.168.1.42:8080").url).toBe(
      "http://192.168.1.42:8080/"
    );
    expect(normalizeMoonrakerUrl("ftp://printer.local").error).toBe(
      "Moonraker URL must use http or https."
    );
  });
});
