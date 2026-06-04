import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GCodeRenderer, SimpleColorizer } from "gcode-viewer";
import type { BedVolume } from "../../lib/bed-volume";
import { analyzeGCode, filterGCodeForPreview, type PreviewEvent } from "../../lib/gcode-analysis";
import { addSceneLights, CANVAS_BG, createBuildPlate } from "./scene";

const ACCENT = 0x0055ff;
const RETRACT_COLOR = 0xff9100;
const PRIME_COLOR = 0x00c853;

interface GCodeViewProps {
  gcode: string;
  lineWidthMm: number;
  /** Top layer to show; the viewer slices [0, layer]. */
  layer: number;
  /** Plate dimensions used to draw the bed under the toolpath preview. */
  volume: BedVolume;
  /** Reports the discovered layer count once the render settles. */
  onReady: (layerCount: number) => void;
}

/**
 * Three.js G-code preview (gcode-viewer). Shows extrusion, travel and
 * retract/prime markers — no toggles, matching the reduced design.
 */
export function GCodeView({ gcode, lineWidthMm, layer, volume, onReady }: GCodeViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<InstanceType<typeof GCodeRenderer> | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const container = containerRef.current;
    const filtered = filterGCodeForPreview(gcode, {
      showExtrusion: true,
      showTravel: true,
      showRetractPrime: true
    });
    if (!container || !filtered.trim()) return undefined;

    container.replaceChildren();
    rendererRef.current?.dispose();

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 320);
    const renderer = new GCodeRenderer(filtered, width, height, new THREE.Color(CANVAS_BG));
    renderer.travelWidth = 0.2;
    renderer.radialSegments = 5;
    renderer.colorizer = new SimpleColorizer(new THREE.Color(ACCENT));
    renderer.setupScene = () => {
      addSceneLights(renderer.scene);
      renderer.scene.add(createBuildPlate(volume));
      renderer.fitCamera();
    };
    container.append(renderer.element());
    rendererRef.current = renderer;

    const stats = analyzeGCode(gcode, lineWidthMm);
    let disposed = false;
    renderer
      .render()
      .then(() => {
        if (disposed) return;
        addEventMarkers(renderer, stats.events);
        const count = Math.max(renderer.layerCount(), stats.layerCount, 1);
        renderer.sliceLayer(0, count);
        onReadyRef.current(count);
      })
      .catch((error) => {
        if (!disposed) {
          container.replaceChildren(
            document.createTextNode(`Preview failed: ${String(error)}`)
          );
        }
      });

    const resizeObserver = new ResizeObserver(() => {
      renderer.resize(
        Math.max(container.clientWidth, 320),
        Math.max(container.clientHeight, 320)
      );
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [
    gcode,
    lineWidthMm,
    volume.minXMm,
    volume.maxXMm,
    volume.minYMm,
    volume.maxYMm,
    volume.minZMm,
    volume.maxZMm
  ]);

  useEffect(() => {
    rendererRef.current?.sliceLayer(0, layer);
  }, [layer]);

  return <div className="canvas-stage" ref={containerRef} />;
}

function addEventMarkers(renderer: InstanceType<typeof GCodeRenderer>, events: PreviewEvent[]) {
  const group = new THREE.Group();
  for (const event of events) {
    const geometry = new THREE.SphereGeometry(event.type === "retract" ? 1.5 : 1.1, 12, 8);
    const material = new THREE.MeshBasicMaterial({
      color: event.type === "retract" ? RETRACT_COLOR : PRIME_COLOR
    });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.set(event.x, event.y, event.z);
    group.add(marker);
  }
  renderer.scene.add(group);
}
