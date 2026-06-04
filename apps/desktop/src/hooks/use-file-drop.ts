import { useEffect, useRef } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

/**
 * Subscribes to the Tauri window drag-and-drop event and reports the first
 * dropped file path. `onError` is wired to the CLI log.
 */
export function useFileDrop(
  onDrop: (path: string) => void,
  onError: (message: string) => void
) {
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;
  const errorRef = useRef(onError);
  errorRef.current = onError;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    try {
      getCurrentWebview()
        .onDragDropEvent((event) => {
          if (event.payload.type !== "drop" || event.payload.paths.length === 0) return;
          dropRef.current(event.payload.paths[0]);
        })
        .then((callback) => {
          unlisten = callback;
        })
        .catch((error) => errorRef.current(`File drop listener failed: ${String(error)}`));
    } catch (error) {
      errorRef.current(`File drop listener failed: ${String(error)}`);
    }

    return () => {
      unlisten?.();
    };
  }, []);
}
