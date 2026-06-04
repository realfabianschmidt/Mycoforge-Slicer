import { useEffect, useRef } from "react";

/** Auto-scrolling CLI log view shown while slicing. */
export function LogStream({ logs }: { logs: string[] }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [logs]);

  return (
    <div className="logstream" ref={ref}>
      {logs.length === 0 && <div className="log-line">Waiting for slicer output…</div>}
      {logs.map((line, index) => (
        <div key={index} className="log-line">
          {line}
        </div>
      ))}
    </div>
  );
}
