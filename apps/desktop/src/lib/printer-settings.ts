import { useCallback, useState } from "react";

export const DEFAULT_MOONRAKER_PORT = "7125";
export const DEFAULT_CONTROL_PORT = "8080";
export const PRINTER_NOT_CONFIGURED = "Printer not configured.";

const STORAGE_KEY = "mycoforge.printer";
const LEGACY_CONTROL_STORAGE_KEY = "mycoforge.printerControl";
const SCHEMA_VERSION = 2;

export interface UrlResult {
  input: string;
  url: string;
  error: string;
}

export type MoonrakerUrlResult = UrlResult;
export type PrinterControlUrlResult = UrlResult;

export interface PrinterDraft {
  hostInput: string;
  moonrakerPort: string;
  controlPort: string;
}

export interface StoredPrinterSettings extends PrinterDraft {
  schemaVersion: 2;
  host: string;
}

export interface StoredPrinterControlSettings {
  controlUrl: string;
}

export interface PrinterSettingsResult extends PrinterDraft {
  configured: boolean;
  host: string;
  moonrakerUrl: string;
  controlUrl: string;
  hostError: string;
  moonrakerPortError: string;
  controlPortError: string;
  error: string;
}

interface HookState {
  saved: PrinterSettingsResult;
  draft: PrinterDraft;
}

export function normalizeMoonrakerUrl(input: string): MoonrakerUrlResult {
  return normalizeUrl(input, DEFAULT_MOONRAKER_PORT, "Moonraker URL");
}

export function normalizePrinterControlUrl(input: string): PrinterControlUrlResult {
  return normalizeUrl(input, DEFAULT_CONTROL_PORT, "Printer control URL", true);
}

export function validatePrinterDraft(draft: PrinterDraft): PrinterSettingsResult {
  const host = normalizeHost(draft.hostInput);
  const moonrakerPort = normalizePort(draft.moonrakerPort, "Moonraker port");
  const controlPort = normalizePort(draft.controlPort, "Control UI port");
  const configured = Boolean(host.host && !host.error && !moonrakerPort.error && !controlPort.error);
  const error = host.host
    ? firstError(host.error, moonrakerPort.error, controlPort.error)
    : PRINTER_NOT_CONFIGURED;

  return {
    hostInput: draft.hostInput,
    moonrakerPort: draft.moonrakerPort,
    controlPort: draft.controlPort,
    configured,
    host: host.host,
    moonrakerUrl: configured ? buildUrl(host.host, moonrakerPort.port) : "",
    controlUrl: configured ? `${buildUrl(host.host, controlPort.port)}/` : "",
    hostError: host.error,
    moonrakerPortError: moonrakerPort.error,
    controlPortError: controlPort.error,
    error
  };
}

export function loadPrinterSettings(storage: Pick<Storage, "getItem">): PrinterSettingsResult {
  const current = loadCurrentSettings(storage);
  if (current) return validatePrinterDraft(current);

  const legacy = loadLegacySettings(storage);
  if (legacy) return validatePrinterDraft(legacy);

  return validatePrinterDraft(emptyDraft());
}

export function loadPrinterControlSettings(
  storage: Pick<Storage, "getItem">
): PrinterControlUrlResult {
  const loaded = loadPrinterSettings(storage);
  if (!loaded.configured) {
    return { input: "", url: "", error: PRINTER_NOT_CONFIGURED };
  }
  return { input: loaded.controlUrl, url: loaded.controlUrl, error: "" };
}

export function savePrinterSettings(
  storage: Pick<Storage, "setItem">,
  settings: PrinterDraft
): PrinterSettingsResult {
  const validated = validatePrinterDraft(settings);
  if (!validated.configured) return validated;

  const stored: StoredPrinterSettings = {
    schemaVersion: SCHEMA_VERSION,
    host: validated.host,
    hostInput: validated.host,
    moonrakerPort: normalizePort(settings.moonrakerPort, "Moonraker port").port,
    controlPort: normalizePort(settings.controlPort, "Control UI port").port
  };

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    /* Persisting printer settings is best-effort. */
  }

  return validatePrinterDraft(stored);
}

export function savePrinterControlSettings(
  storage: Pick<Storage, "getItem" | "setItem">,
  settings: StoredPrinterControlSettings
): void {
  const parsed = extractHostPort(settings.controlUrl);
  if (!parsed.host) return;

  const current = loadPrinterSettings(storage);
  savePrinterSettings(storage, {
    hostInput: parsed.host,
    moonrakerPort: current.configured ? current.moonrakerPort : DEFAULT_MOONRAKER_PORT,
    controlPort: parsed.port || DEFAULT_CONTROL_PORT
  });
}

export function draftFromResult(result: PrinterSettingsResult): PrinterDraft {
  return {
    hostInput: result.host || result.hostInput,
    moonrakerPort: result.moonrakerPort || DEFAULT_MOONRAKER_PORT,
    controlPort: result.controlPort || DEFAULT_CONTROL_PORT
  };
}

export function usePrinterSettings() {
  const [state, setState] = useState<HookState>(() => {
    const saved = loadPrinterSettings(window.localStorage);
    return { saved, draft: draftFromResult(saved) };
  });

  const setDraft = useCallback((patch: Partial<PrinterDraft>) => {
    setState((current) => ({
      ...current,
      draft: { ...current.draft, ...patch }
    }));
  }, []);

  const resetDraft = useCallback(() => {
    setState((current) => ({ ...current, draft: draftFromResult(current.saved) }));
  }, []);

  const save = useCallback(() => {
    const saved = savePrinterSettings(window.localStorage, state.draft);
    if (saved.configured) {
      setState({ saved, draft: draftFromResult(saved) });
    }
    return saved;
  }, [state.draft]);

  const draftResult = validatePrinterDraft(state.draft);

  return {
    ...state.saved,
    moonrakerError: state.saved.error,
    controlError: state.saved.error,
    draft: state.draft,
    draftResult,
    setDraft,
    resetDraft,
    save
  };
}

function emptyDraft(): PrinterDraft {
  return {
    hostInput: "",
    moonrakerPort: DEFAULT_MOONRAKER_PORT,
    controlPort: DEFAULT_CONTROL_PORT
  };
}

function loadCurrentSettings(storage: Pick<Storage, "getItem">): PrinterDraft | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;

    if (
      parsed.schemaVersion === SCHEMA_VERSION &&
      typeof parsed.host === "string" &&
      typeof parsed.moonrakerPort === "string" &&
      typeof parsed.controlPort === "string"
    ) {
      return {
        hostInput: parsed.host,
        moonrakerPort: parsed.moonrakerPort,
        controlPort: parsed.controlPort
      };
    }
  } catch {
    /* Broken storage is treated as unconfigured. */
  }
  return null;
}

function loadLegacySettings(storage: Pick<Storage, "getItem">): PrinterDraft | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed) && typeof parsed.moonrakerUrl === "string") {
        const moonraker = extractHostPort(parsed.moonrakerUrl);
        if (moonraker.host) {
          const control = loadLegacyControl(storage);
          return {
            hostInput: moonraker.host,
            moonrakerPort: moonraker.port || DEFAULT_MOONRAKER_PORT,
            controlPort: control?.port || DEFAULT_CONTROL_PORT
          };
        }
      }
    }
  } catch {
    /* Continue with the control URL fallback. */
  }

  const control = loadLegacyControl(storage);
  if (!control?.host) return null;
  return {
    hostInput: control.host,
    moonrakerPort: DEFAULT_MOONRAKER_PORT,
    controlPort: control.port || DEFAULT_CONTROL_PORT
  };
}

function loadLegacyControl(storage: Pick<Storage, "getItem">): { host: string; port: string } | null {
  try {
    const raw = storage.getItem(LEGACY_CONTROL_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed) && typeof parsed.controlUrl === "string") {
      return extractHostPort(parsed.controlUrl);
    }
  } catch {
    /* Ignore broken legacy control settings. */
  }
  return null;
}

function normalizeUrl(
  input: string,
  defaultPort: string,
  label: string,
  keepPath = false
): UrlResult {
  const parsed = parseUrl(input);
  if (parsed.error) return { input, url: "", error: parsed.error.replace("Printer host", label) };
  if (!parsed.host) return { input, url: "", error: `${label} needs a host or IP address.` };
  const port = parsed.port || defaultPort;
  const origin = buildUrl(parsed.host, port);
  const path = keepPath ? parsed.path || "/" : "";
  return { input, url: `${origin}${path}`, error: "" };
}

function normalizeHost(input: string): { host: string; error: string } {
  const parsed = parseUrl(input);
  return { host: parsed.host, error: parsed.error };
}

function normalizePort(input: string, label: string): { port: string; error: string } {
  const value = input.trim();
  if (!value) return { port: "", error: `${label} is required.` };
  if (!/^\d+$/.test(value)) return { port: "", error: `${label} must be a number.` };
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { port: "", error: `${label} must be between 1 and 65535.` };
  }
  return { port: String(port), error: "" };
}

function extractHostPort(input: string): { host: string; port: string } {
  const parsed = parseUrl(input);
  return { host: parsed.host, port: parsed.port };
}

function parseUrl(input: string): { host: string; port: string; path: string; error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { host: "", port: "", path: "", error: "Printer host is required." };
  if (/\s/.test(trimmed)) {
    return { host: "", port: "", path: "", error: "Printer host must not contain spaces." };
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return { host: "", port: "", path: "", error: "Printer host must use http or https." };
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { host: "", port: "", path: "", error: "Printer host must use http or https." };
    }
    if (!parsed.hostname) {
      return { host: "", port: "", path: "", error: "Printer host needs a host or IP address." };
    }
    return {
      host: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname === "/" ? "/" : `${parsed.pathname}${parsed.search}${parsed.hash}`,
      error: ""
    };
  } catch {
    return { host: "", port: "", path: "", error: "Printer host is not valid." };
  }
}

function buildUrl(host: string, port: string): string {
  const urlHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${urlHost}:${port}`;
}

function firstError(...errors: string[]): string {
  return errors.find(Boolean) ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
