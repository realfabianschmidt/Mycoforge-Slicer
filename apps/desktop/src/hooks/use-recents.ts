import { useCallback, useState } from "react";
import { basename } from "../lib/format";

export interface RecentFile {
  path: string;
  name: string;
  ts: number;
}

const STORAGE_KEY = "mycoforge.recents";
const MAX_RECENTS = 8;

/** Pure: prepend a path, dedupe by path, cap the list. Unit-tested. */
export function pushRecent(
  list: RecentFile[],
  path: string,
  now: number = Date.now()
): RecentFile[] {
  if (!path.trim()) return list;
  const entry: RecentFile = { path, name: basename(path), ts: now };
  return [entry, ...list.filter((item) => item.path !== path)].slice(0, MAX_RECENTS);
}

function loadRecents(): RecentFile[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RecentFile =>
        typeof item?.path === "string" &&
        typeof item?.name === "string" &&
        typeof item?.ts === "number"
    );
  } catch {
    return [];
  }
}

function saveRecents(list: RecentFile[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable — recents are best-effort */
  }
}

/** localStorage-backed list of recently opened files. */
export function useRecents() {
  const [recents, setRecents] = useState<RecentFile[]>(loadRecents);

  const remember = useCallback((path: string) => {
    setRecents((current) => {
      const next = pushRecent(current, path);
      saveRecents(next);
      return next;
    });
  }, []);

  return { recents, remember };
}
