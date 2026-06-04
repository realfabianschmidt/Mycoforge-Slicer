/** Path & display formatting helpers — pure, no side effects. */

/** Filename portion of a path, handling both `/` and `\` separators. */
export function basename(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}

/** Directory portion of a path, without trailing separator (`""` if none). */
export function dirname(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return idx === -1 ? "" : trimmed.slice(0, idx);
}

/** Lower-case file extension including the dot, or `""` if none. */
export function fileExtension(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

/** Human-friendly timestamp: clock time today, "Yesterday", else a short date. */
export function formatRelativeTime(ts: number, now: number = Date.now()): string {
  const date = new Date(ts);
  const today = new Date(now);
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}
