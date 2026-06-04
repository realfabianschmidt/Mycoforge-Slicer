import { Button } from "../../components/ui/Button";
import {
  defaultMinExtrusionPathMm,
  type MaterialProfile,
  type RetractionStrength,
  type SliceSettingsState
} from "../../lib/settings";
import { NumberSlider } from "./NumberSlider";
import { SegmentedControl } from "./SegmentedControl";

interface ProfilePanelProps {
  materials: MaterialProfile[];
  selectedMaterialId: string;
  onSelectMaterial: (id: string) => void;
  settings: SliceSettingsState;
  onSettingsChange: (settings: SliceSettingsState) => void;
  moonrakerError: string;
  isFetchingNozzle: boolean;
  onFetchPrinterNozzle: () => void;
}

const RETRACTION_OPTIONS: { value: RetractionStrength; label: string }[] = [
  { value: "soft", label: "Soft" },
  { value: "normal", label: "Normal" },
  { value: "strong", label: "Strong" }
];

const MODE_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "vase", label: "Vase" }
] as const;

const TOGGLE_OPTIONS = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" }
] as const;

/** Step 02 — material profile and slicing parameters. */
export function ProfilePanel({
  materials,
  selectedMaterialId,
  onSelectMaterial,
  settings,
  onSettingsChange,
  moonrakerError,
  isFetchingNozzle,
  onFetchPrinterNozzle
}: ProfilePanelProps) {
  function update<K extends keyof SliceSettingsState>(key: K, value: SliceSettingsState[K]) {
    onSettingsChange({ ...settings, [key]: value });
  }

  function updateLineWidth(value: number) {
    const currentDefault = defaultMinExtrusionPathMm(settings.lineWidthMm);
    const minExtrusionPathMm =
      settings.minExtrusionPathMm === currentDefault
        ? defaultMinExtrusionPathMm(value)
        : settings.minExtrusionPathMm;
    onSettingsChange({ ...settings, lineWidthMm: value, minExtrusionPathMm });
  }

  return (
    <>
      <div className="panel-head">
        <div className="panel-title">Profile</div>
        <div className="panel-tag">02 / 04</div>
      </div>

      <SegmentedControl
        label="Material"
        options={materials.map((material) => ({ value: material.id, label: material.name }))}
        value={selectedMaterialId}
        onChange={onSelectMaterial}
      />

      <div className="divider" />

      <div className="profile-line-width">
        <Button
          variant="secondary"
          size="sm"
          loading={isFetchingNozzle}
          disabled={Boolean(moonrakerError)}
          onClick={onFetchPrinterNozzle}
        >
          Use printer nozzle
        </Button>
        {moonrakerError ? <span className="profile-inline-error">{moonrakerError}</span> : null}
      </div>
      <NumberSlider
        label="Line width"
        value={settings.lineWidthMm}
        min={2}
        max={20}
        step={0.5}
        unit="mm"
        onChange={updateLineWidth}
      />
      <NumberSlider
        label="Layer height"
        value={settings.layerHeightMm}
        min={0.4}
        max={4}
        step={0.1}
        unit="mm"
        onChange={(value) => update("layerHeightMm", value)}
      />
      <NumberSlider
        label="Print speed"
        value={settings.printSpeedMmS}
        min={5}
        max={60}
        step={1}
        unit="mm/s"
        onChange={(value) => update("printSpeedMmS", value)}
      />
      <NumberSlider
        label="Travel speed"
        value={settings.travelSpeedMmS}
        min={20}
        max={180}
        step={5}
        unit="mm/s"
        onChange={(value) => update("travelSpeedMmS", value)}
      />

      <div className="divider" />

      <SegmentedControl
        label="Toolpath"
        options={[...MODE_OPTIONS]}
        value={settings.vaseMode ? "vase" : "standard"}
        onChange={(value) => update("vaseMode", value === "vase")}
      />
      <SegmentedControl
        label="Smooth vase"
        options={[...TOGGLE_OPTIONS]}
        value={settings.smoothVase ? "on" : "off"}
        onChange={(value) => update("smoothVase", value === "on")}
      />
      <SegmentedControl
        label="Short paths"
        options={[
          { value: "on", label: "Filter" },
          { value: "off", label: "Keep" }
        ]}
        value={settings.filterShortExtrusions ? "on" : "off"}
        onChange={(value) => update("filterShortExtrusions", value === "on")}
      />
      <NumberSlider
        label="Min path"
        value={settings.minExtrusionPathMm}
        min={0}
        max={30}
        step={0.5}
        unit="mm"
        onChange={(value) => update("minExtrusionPathMm", value)}
      />
      <NumberSlider
        label="Wall loops"
        value={settings.wallLoops}
        min={1}
        max={6}
        step={1}
        onChange={(value) => update("wallLoops", value)}
      />
      <NumberSlider
        label="Top layers"
        value={settings.topShellLayers}
        min={0}
        max={8}
        step={1}
        onChange={(value) => update("topShellLayers", value)}
      />
      <NumberSlider
        label="Bottom layers"
        value={settings.bottomShellLayers}
        min={0}
        max={8}
        step={1}
        onChange={(value) => update("bottomShellLayers", value)}
      />
      <NumberSlider
        label="Infill"
        value={settings.infillDensityPercent}
        min={0}
        max={100}
        step={5}
        unit="%"
        onChange={(value) => update("infillDensityPercent", value)}
      />

      <SegmentedControl
        label="Material stop"
        options={RETRACTION_OPTIONS}
        value={settings.retractionStrength}
        onChange={(value) => update("retractionStrength", value)}
        columns={3}
        centered
      />
    </>
  );
}
