import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listMaterialProfiles } from "../lib/api";
import { fallbackMaterials, type MaterialProfile } from "../lib/settings";

interface MaterialsOptions {
  /** Reports a load failure (wired to the CLI log). */
  onError: (message: string) => void;
  /** Pushes a material's slicing defaults into the settings state. */
  onMaterialApplied: (material: MaterialProfile) => void;
}

/**
 * Loads material profiles on mount and tracks the current selection. Applies
 * the chosen material's defaults via `onMaterialApplied`.
 */
export function useMaterials({ onError, onMaterialApplied }: MaterialsOptions) {
  const [materials, setMaterials] = useState<MaterialProfile[]>(fallbackMaterials);
  const [selectedMaterialId, setSelectedMaterialId] = useState(fallbackMaterials[0].id);

  // Latest callbacks without re-triggering the load effect.
  const appliedRef = useRef(onMaterialApplied);
  appliedRef.current = onMaterialApplied;
  const errorRef = useRef(onError);
  errorRef.current = onError;

  const selectedMaterial = useMemo(
    () => materials.find((material) => material.id === selectedMaterialId) ?? materials[0],
    [materials, selectedMaterialId]
  );

  useEffect(() => {
    listMaterialProfiles()
      .then((loaded) => {
        if (loaded.length === 0) return;
        const defaultMaterial =
          loaded.find((material) => material.id === "mycelium_default") ?? loaded[0];
        setMaterials(loaded);
        setSelectedMaterialId(defaultMaterial.id);
        appliedRef.current(defaultMaterial);
      })
      .catch((error) => errorRef.current(`Material profile load failed: ${String(error)}`));
  }, []);

  const selectMaterial = useCallback(
    (id: string) => {
      setSelectedMaterialId(id);
      const material = materials.find((item) => item.id === id);
      if (material) appliedRef.current(material);
    },
    [materials]
  );

  return { materials, selectedMaterialId, selectedMaterial, selectMaterial };
}
