import { useCallback, useEffect, useState } from "react";

export type AccentId = "orange" | "blue" | "green" | "amber";

export interface AccentPreset {
  id: AccentId;
  label: string;
  hex: string;
  deep: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "orange", label: "Orange", hex: "#ff5a1f", deep: "#d44614" },
  { id: "blue", label: "Blue", hex: "#0055ff", deep: "#0047d6" },
  { id: "green", label: "Green", hex: "#00c853", deep: "#00a344" },
  { id: "amber", label: "Amber", hex: "#f9a03f", deep: "#d97f1f" }
];

const STORAGE_KEY = "mycoforge.accent";
const DEFAULT_ACCENT: AccentId = "orange";

function presetById(id: string | null): AccentPreset {
  return ACCENT_PRESETS.find((preset) => preset.id === id) ?? ACCENT_PRESETS[0];
}

/** Writes the accent variants onto the document root. Mirrors the printer UI. */
export function applyAccent(id: AccentId): void {
  const preset = presetById(id);
  const r = parseInt(preset.hex.slice(1, 3), 16);
  const g = parseInt(preset.hex.slice(3, 5), 16);
  const b = parseInt(preset.hex.slice(5, 7), 16);
  const root = document.documentElement;
  root.style.setProperty("--accent", preset.hex);
  root.style.setProperty("--accent-deep", preset.deep);
  root.style.setProperty("--accent-06", `rgba(${r}, ${g}, ${b}, 0.06)`);
  root.style.setProperty("--accent-12", `rgba(${r}, ${g}, ${b}, 0.12)`);
  root.style.setProperty("--accent-25", `rgba(${r}, ${g}, ${b}, 0.25)`);
}

export function loadAccent(): AccentId {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && ACCENT_PRESETS.some((p) => p.id === raw)) return raw as AccentId;
  } catch {
    /* localStorage may be unavailable in tests. */
  }
  return DEFAULT_ACCENT;
}

/** Persists the accent and applies it immediately. */
export function useAccent() {
  const [accent, setAccentState] = useState<AccentId>(() => loadAccent());

  useEffect(() => {
    applyAccent(accent);
    try {
      window.localStorage.setItem(STORAGE_KEY, accent);
    } catch {
      /* Persisting accent is best-effort. */
    }
  }, [accent]);

  const setAccent = useCallback((next: AccentId) => {
    setAccentState(next);
  }, []);

  return { accent, setAccent };
}
