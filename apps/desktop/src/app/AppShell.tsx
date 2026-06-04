import type { ReactNode } from "react";

interface AppShellProps {
  spine: ReactNode;
  rail: ReactNode;
  canvas: ReactNode;
  /** Context-panel content for the active step (wrapped here in <section>). */
  panel: ReactNode;
  action: ReactNode;
  /** Drives layout transitions: in "printer" mode the slicer chrome slides out. */
  mode?: "slicer" | "printer";
}

/** The single-screen grid: spine / rail / canvas / panel / action. */
export function AppShell({ spine, rail, canvas, panel, action, mode = "slicer" }: AppShellProps) {
  return (
    <>
      <div className="orb-bg" aria-hidden="true" />
      <div className="shell" data-mode={mode}>
        {spine}
        {rail}
        {canvas}
        <section className="panel">{panel}</section>
        {action}
      </div>
    </>
  );
}
