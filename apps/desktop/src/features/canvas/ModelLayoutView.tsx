import { useEffect, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { Spinner } from "../../components/ui/Spinner";
import { readBinaryFile, type ModelTransform } from "../../lib/api";
import { bedCenterXMm, bedCenterYMm, type BedVolume } from "../../lib/bed-volume";
import {
  isStlPath,
  normalizeDegrees,
  normalizeTransform,
  type PlacementTool
} from "../../lib/model";
import {
  addSceneLights,
  CANVAS_BG,
  configurePlateCamera,
  createBoundsHelper,
  createBuildPlate,
  measureModelBounds,
  type ModelBounds
} from "./scene";

interface ModelLayoutViewProps {
  modelPath: string;
  transform: ModelTransform;
  tool: PlacementTool;
  volume: BedVolume;
  onTransformPreview: (transform: ModelTransform) => void;
  onTransformCommit: (transform: ModelTransform, previous?: ModelTransform) => void;
  onBoundsChange: (bounds: ModelBounds | null) => void;
}

interface ModelScene {
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  transformControls: TransformControls;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  group: THREE.Group;
  boundsHelper: THREE.BoxHelper;
  animationId: number;
  isTransforming: boolean;
  disposeCallbacks: Array<() => void>;
}

/** Interactive STL placement on the shared Mycoforge build plate. */
export function ModelLayoutView({
  modelPath,
  transform,
  tool,
  volume,
  onTransformPreview,
  onTransformCommit,
  onBoundsChange
}: ModelLayoutViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<ModelScene | null>(null);
  const transformRef = useRef(transform);
  const volumeRef = useRef(volume);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Latest-ref pattern for the parent callbacks. Without this, an unstable
  // callback reference would re-trigger the STL-load effect on every render
  // and the scene would flicker / load forever.
  const onBoundsChangeRef = useRef(onBoundsChange);
  const onTransformPreviewRef = useRef(onTransformPreview);
  const onTransformCommitRef = useRef(onTransformCommit);
  useEffect(() => {
    onBoundsChangeRef.current = onBoundsChange;
  }, [onBoundsChange]);
  useEffect(() => {
    onTransformPreviewRef.current = onTransformPreview;
  }, [onTransformPreview]);
  useEffect(() => {
    onTransformCommitRef.current = onTransformCommit;
  }, [onTransformCommit]);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    transformRef.current = transform;
    const scene = sceneRef.current;
    if (!scene || scene.isTransforming) return;
    applyModelTransform(scene.group, transform, volumeRef.current);
    updateSceneBounds(scene, onBoundsChangeRef.current, volumeRef.current);
  }, [transform]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    configureTransformControls(scene.transformControls, tool);
  }, [tool]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    disposeModelScene(sceneRef.current);
    sceneRef.current = null;
    container.replaceChildren();
    setError("");
    onBoundsChangeRef.current(null);

    if (!isStlPath(modelPath)) {
      setError("3MF files are sliced directly - no layout preview.");
      return undefined;
    }

    let disposed = false;
    setLoading(true);
    const volumeAtMount = volumeRef.current;
    readBinaryFile(modelPath)
      .then((bytes) => {
        if (disposed) return;
        sceneRef.current = createModelScene(
          container,
          new Uint8Array(bytes).buffer,
          transformRef,
          tool,
          volumeAtMount,
          (next) => onTransformPreviewRef.current(next),
          (next, previous) => onTransformCommitRef.current(next, previous),
          (bounds) => onBoundsChangeRef.current(bounds)
        );
        setLoading(false);
      })
      .catch((loadError) => {
        if (disposed) return;
        setLoading(false);
        setError(`Model preview failed: ${String(loadError)}`);
      });

    return () => {
      disposed = true;
      onBoundsChangeRef.current(null);
      disposeModelScene(sceneRef.current);
      sceneRef.current = null;
    };
    // Re-runs on modelPath OR when the bed dimensions change (so the plate
    // visibly updates after a printer-volume sync). Callbacks use the
    // latest-ref proxies above; `tool` is mirrored by the separate effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    modelPath,
    volume.minXMm,
    volume.maxXMm,
    volume.minYMm,
    volume.maxYMm,
    volume.minZMm,
    volume.maxZMm
  ]);

  return (
    <>
      <div className="canvas-stage" ref={containerRef} />
      {error && <div className="canvas-note">{error}</div>}
      {loading && (
        <div className="canvas-note">
          <Spinner size={28} label="Loading model" />
        </div>
      )}
    </>
  );
}

function createModelScene(
  container: HTMLDivElement,
  buffer: ArrayBuffer,
  transformRef: MutableRefObject<ModelTransform>,
  tool: PlacementTool,
  volume: BedVolume,
  onTransformPreview: (transform: ModelTransform) => void,
  onTransformCommit: (transform: ModelTransform, previous?: ModelTransform) => void,
  onBoundsChange: (bounds: ModelBounds | null) => void
): ModelScene {
  const width = Math.max(container.clientWidth, 320);
  const height = Math.max(container.clientHeight, 320);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CANVAS_BG);

  const reach = Math.max(volume.sizeXMm, volume.sizeYMm, volume.heightZMm);
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, reach * 8);
  configurePlateCamera(camera, width, height, volume);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  container.append(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(bedCenterXMm(volume), bedCenterYMm(volume), 20);
  controls.enableDamping = true;
  controls.update();

  addSceneLights(scene);
  scene.add(createBuildPlate(volume));

  const geometry = new STLLoader().parse(buffer) as THREE.BufferGeometry;
  normalizeGeometryToPlateOrigin(geometry);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x1f6fff,
    roughness: 0.48,
    metalness: 0.05
  });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, material));
  applyModelTransform(group, transformRef.current, volume);
  scene.add(group);

  const boundsHelper = createBoundsHelper(group);
  scene.add(boundsHelper);

  const transformControls = new TransformControls(camera, renderer.domElement);
  configureTransformControls(transformControls, tool);
  transformControls.minX = volume.minXMm;
  transformControls.maxX = volume.maxXMm;
  transformControls.minY = volume.minYMm;
  transformControls.maxY = volume.maxYMm;
  transformControls.minZ = volume.minZMm;
  transformControls.maxZ = volume.maxZMm;
  transformControls.attach(group);
  scene.add(transformControls.getHelper() as THREE.Object3D);

  const state: ModelScene = {
    renderer,
    controls,
    transformControls,
    scene,
    camera,
    group,
    boundsHelper,
    animationId: 0,
    isTransforming: false,
    disposeCallbacks: []
  };

  let dragStart: ModelTransform | null = null;
  const handleMouseDown = () => {
    dragStart = transformRef.current;
    state.isTransforming = true;
    controls.enabled = false;
  };
  const handleObjectChange = () => {
    const next = transformFromGroup(group, volume);
    applyModelTransform(group, next, volume);
    transformRef.current = next;
    updateSceneBounds(state, onBoundsChange, volume);
    onTransformPreview(next);
  };
  const handleMouseUp = () => {
    const next = transformFromGroup(group, volume);
    state.isTransforming = false;
    controls.enabled = true;
    applyModelTransform(group, next, volume);
    updateSceneBounds(state, onBoundsChange, volume);
    onTransformCommit(next, dragStart ?? undefined);
    dragStart = null;
  };

  transformControls.addEventListener("mouseDown", handleMouseDown);
  transformControls.addEventListener("objectChange", handleObjectChange);
  transformControls.addEventListener("mouseUp", handleMouseUp);
  state.disposeCallbacks.push(() => {
    transformControls.removeEventListener("mouseDown", handleMouseDown);
    transformControls.removeEventListener("objectChange", handleObjectChange);
    transformControls.removeEventListener("mouseUp", handleMouseUp);
  });

  const resizeObserver = new ResizeObserver(() => {
    const nextWidth = Math.max(container.clientWidth, 320);
    const nextHeight = Math.max(container.clientHeight, 320);
    configurePlateCamera(camera, nextWidth, nextHeight, volume);
    renderer.setSize(nextWidth, nextHeight);
  });
  resizeObserver.observe(container);
  state.disposeCallbacks.push(() => resizeObserver.disconnect());

  const render = () => {
    controls.update();
    boundsHelper.update();
    renderer.render(scene, camera);
    state.animationId = window.requestAnimationFrame(render);
  };
  updateSceneBounds(state, onBoundsChange, volume);
  render();
  return state;
}

function configureTransformControls(transformControls: TransformControls, tool: PlacementTool) {
  const mode = tool === "move" ? "translate" : tool;
  transformControls.setMode(mode);
  transformControls.setSpace(tool === "rotate" ? "local" : "world");
  transformControls.setSize(0.85);
  transformControls.setTranslationSnap(1);
  transformControls.setRotationSnap(THREE.MathUtils.degToRad(5));
  transformControls.setScaleSnap(0.05);
}

function normalizeGeometryToPlateOrigin(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) return;
  const centerX = (bounds.min.x + bounds.max.x) / 2;
  const centerY = (bounds.min.y + bounds.max.y) / 2;
  geometry.translate(-centerX, -centerY, -bounds.min.z);
  geometry.computeBoundingBox();
}

function applyModelTransform(
  group: THREE.Group | null,
  transform: ModelTransform,
  volume: BedVolume
) {
  if (!group) return;
  const normalized = normalizeTransform(transform, volume);
  const centerX = bedCenterXMm(volume);
  const centerY = bedCenterYMm(volume);
  group.position.set(centerX + normalized.translateXMm, centerY + normalized.translateYMm, 0);
  group.rotation.set(
    THREE.MathUtils.degToRad(normalized.rotateXDeg),
    THREE.MathUtils.degToRad(normalized.rotateYDeg),
    THREE.MathUtils.degToRad(normalized.rotateZDeg),
    "XYZ"
  );
  group.scale.setScalar(normalized.scale);
  group.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(group);
  group.position.z += normalized.translateZMm - box.min.z;
  group.updateMatrixWorld(true);
}

function transformFromGroup(group: THREE.Group, volume: BedVolume): ModelTransform {
  group.updateMatrixWorld(true);
  const bounds = measureModelBounds(group, volume);
  const uniformScale = Math.max(group.scale.x, group.scale.y, group.scale.z);
  return normalizeTransform(
    {
      translateXMm: group.position.x - bedCenterXMm(volume),
      translateYMm: group.position.y - bedCenterYMm(volume),
      translateZMm: Math.max(0, bounds.minZ),
      rotateXDeg: normalizeDegrees(THREE.MathUtils.radToDeg(group.rotation.x)),
      rotateYDeg: normalizeDegrees(THREE.MathUtils.radToDeg(group.rotation.y)),
      rotateZDeg: normalizeDegrees(THREE.MathUtils.radToDeg(group.rotation.z)),
      scale: uniformScale
    },
    volume
  );
}

function updateSceneBounds(
  scene: ModelScene,
  onBoundsChange: (bounds: ModelBounds | null) => void,
  volume: BedVolume
) {
  scene.boundsHelper.update();
  const bounds = measureModelBounds(scene.group, volume);
  const material = scene.boundsHelper.material as THREE.LineBasicMaterial;
  material.color.setHex(bounds.valid ? 0x0b57d0 : 0xd93025);
  onBoundsChange(bounds);
}

function disposeModelScene(scene: ModelScene | null) {
  if (!scene) return;
  window.cancelAnimationFrame(scene.animationId);
  scene.disposeCallbacks.forEach((dispose) => dispose());
  scene.transformControls.detach();
  scene.transformControls.dispose();
  scene.controls.dispose();
  scene.renderer.domElement.replaceWith();
  scene.scene.traverse((object: THREE.Object3D) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else {
      material?.dispose();
    }
  });
  scene.renderer.dispose();
}
