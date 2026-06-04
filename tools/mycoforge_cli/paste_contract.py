"""Paste-specific G-code metadata and Klipper-safe helpers."""

from __future__ import annotations

from dataclasses import dataclass
import json
import math
import re
from pathlib import Path
from typing import Any

from .gcode_parser import parse_params, split_comment


DEFAULT_VIRTUAL_FILAMENT_DIAMETER_MM = 5.0
COMMENT_ONLY_CONTRACT = "comment_only"
MYCO_MACRO_CONTRACT = "myco_macros"

BED_MESH_MODE_ALWAYS = "always"
BED_MESH_MODE_LOAD = "load"
BED_MESH_MODE_SKIP = "skip"
BED_MESH_MODES = (BED_MESH_MODE_ALWAYS, BED_MESH_MODE_LOAD, BED_MESH_MODE_SKIP)


def normalize_bed_mesh_mode(value: str | None) -> str:
    """Coerce arbitrary input to a known BED_MESH mode (default: ``always``)."""
    if value is None:
        return BED_MESH_MODE_ALWAYS
    candidate = str(value).strip().lower()
    if candidate not in BED_MESH_MODES:
        return BED_MESH_MODE_ALWAYS
    return candidate


@dataclass(frozen=True)
class PasteMetrics:
    line_width_mm: float
    layer_height_mm: float
    print_speed_mm_s: float
    slicer_nozzle_mm: float
    volumetric_flow_mm3_s: float
    virtual_e_area_mm2: float
    virtual_e_rate_mm_s: float
    max_volumetric_flow_mm3_s: float | None


@dataclass(frozen=True)
class ObjectDefinition:
    name: str
    center_x: float
    center_y: float
    polygon: list[list[float]]

    def as_gcode(self) -> str:
        polygon = json.dumps(self.polygon, separators=(",", ":"))
        return (
            f"EXCLUDE_OBJECT_DEFINE NAME={self.name} "
            f"CENTER={format_number(self.center_x)},{format_number(self.center_y)} POLYGON={polygon}"
        )


def paste_metrics(
    material: dict[str, Any],
    *,
    slicer_nozzle_mm: float | None = None,
) -> PasteMetrics:
    line_width = float(material.get("line_width_mm", 0.0))
    layer_height = float(material.get("layer_height_mm", 0.0))
    print_speed = float(material.get("print_speed_mm_s", 0.0))
    flow = material.get("flow", {})
    paste = material.get("paste", {})
    nozzle = _slicer_nozzle(material, slicer_nozzle_mm)
    virtual_e_area = _virtual_e_area(flow, paste)
    volumetric_flow = line_width * layer_height * print_speed
    max_volumetric = _optional_float(flow.get("max_volumetric_flow_mm3_s"))
    return PasteMetrics(
        line_width_mm=line_width,
        layer_height_mm=layer_height,
        print_speed_mm_s=print_speed,
        slicer_nozzle_mm=nozzle,
        volumetric_flow_mm3_s=volumetric_flow,
        virtual_e_area_mm2=virtual_e_area,
        virtual_e_rate_mm_s=volumetric_flow / virtual_e_area if virtual_e_area > 0 else 0.0,
        max_volumetric_flow_mm3_s=max_volumetric,
    )


def macro_contract(material: dict[str, Any]) -> str:
    klipper = material.get("klipper", {})
    if isinstance(klipper, dict):
        contract = str(klipper.get("macro_contract", COMMENT_ONLY_CONTRACT))
        if contract == MYCO_MACRO_CONTRACT:
            return MYCO_MACRO_CONTRACT
    return COMMENT_ONLY_CONTRACT


def build_mycoforge_header(
    material: dict[str, Any],
    *,
    object_definition: ObjectDefinition | None = None,
    slicer_nozzle_mm: float | None = None,
    bed_mesh_mode: str = BED_MESH_MODE_ALWAYS,
) -> list[str]:
    metrics = paste_metrics(material, slicer_nozzle_mm=slicer_nozzle_mm)
    contract = macro_contract(material)
    material_id = str(material.get("id", "unknown"))
    retraction = material.get("retraction", {})
    motion = material.get("motion", {})
    retraction_mode = (
        retraction.get("mode", "pcp_pressure_relief") if isinstance(retraction, dict) else ""
    )
    accel = motion.get("acceleration_mm_s2", 300) if isinstance(motion, dict) else 300
    scv = motion.get("square_corner_velocity", 2.0) if isinstance(motion, dict) else 2.0

    lines = [
        "; generated_by = Mycoforge Studio",
        f"; mycoforge_profile = {material_id}",
        f"; mycoforge_contract = {contract}",
        f"; line_width_mm = {format_number(metrics.line_width_mm)}",
        f"; layer_height_mm = {format_number(metrics.layer_height_mm)}",
        f"; slicer_nozzle_mm = {format_number(metrics.slicer_nozzle_mm)}",
        f"; print_speed_mm_s = {format_number(metrics.print_speed_mm_s)}",
        f"; volumetric_flow_mm3_s = {format_number(metrics.volumetric_flow_mm3_s)}",
        f"; virtual_e_area_mm2 = {format_number(metrics.virtual_e_area_mm2)}",
        f"; virtual_e_rate_mm_s = {format_number(metrics.virtual_e_rate_mm_s)}",
        f"; retraction_mode = {retraction_mode}",
    ]
    if metrics.max_volumetric_flow_mm3_s is not None:
        lines.append(
            f"; max_volumetric_flow_mm3_s = {format_number(metrics.max_volumetric_flow_mm3_s)}"
        )
    lines.append(
        f"; PISTON_SYNC_START E_RATE={format_number(metrics.virtual_e_rate_mm_s)}"
    )
    lines.append(
        "START_PRINT "
        f"NOZZLE={format_number(metrics.slicer_nozzle_mm)} "
        f"LAYER_HEIGHT={format_number(metrics.layer_height_mm)} "
        f"LINE_WIDTH={format_number(metrics.line_width_mm)} "
        f"E_RATE={format_number(metrics.virtual_e_rate_mm_s)} "
        f"BED_MESH={normalize_bed_mesh_mode(bed_mesh_mode)}"
    )
    start_line = (
        f"MYCO_START MATERIAL={material_id} LINE_WIDTH={format_number(metrics.line_width_mm)} "
        f"LAYER_HEIGHT={format_number(metrics.layer_height_mm)}"
    )
    lines.append(start_line if contract == MYCO_MACRO_CONTRACT else f";{start_line}")
    if object_definition is not None:
        lines.append(object_definition.as_gcode())
    lines.append(f"SET_VELOCITY_LIMIT ACCEL={accel} SQUARE_CORNER_VELOCITY={scv}")
    return lines


def build_mycoforge_footer(material: dict[str, Any]) -> list[str]:
    if macro_contract(material) == MYCO_MACRO_CONTRACT:
        return ["MYCO_END"]
    return [";MYCO_END"]


def safe_retraction_translation_mode(material: dict[str, Any]) -> str:
    retraction = material.get("retraction", {})
    if not isinstance(retraction, dict):
        return "annotate_only"
    requested = retraction.get("translation_mode", "annotate_only")
    if requested == "macro_translate" and macro_contract(material) != MYCO_MACRO_CONTRACT:
        return "annotate_only"
    return str(requested)


def object_definition_from_gcode(lines: list[str], source_path: Path) -> ObjectDefinition | None:
    bounds = _xy_extrusion_bounds(lines)
    if bounds is None:
        return None
    min_x, max_x, min_y, max_y = bounds
    return ObjectDefinition(
        name=sanitize_object_name(source_path.stem),
        center_x=(min_x + max_x) / 2.0,
        center_y=(min_y + max_y) / 2.0,
        polygon=[
            [round(min_x, 3), round(min_y, 3)],
            [round(max_x, 3), round(min_y, 3)],
            [round(max_x, 3), round(max_y, 3)],
            [round(min_x, 3), round(max_y, 3)],
        ],
    )


def format_number(value: float) -> str:
    if float(value).is_integer():
        return str(int(value))
    return f"{value:.4f}".rstrip("0").rstrip(".")


def sanitize_object_name(value: str) -> str:
    sanitized = re.sub(r"[^A-Za-z0-9_-]+", "_", value).strip("_")
    return sanitized or "mycoforge_object"


def _virtual_e_area(flow: Any, paste: Any) -> float:
    for container in [paste, flow]:
        if not isinstance(container, dict):
            continue
        explicit = _optional_float(container.get("virtual_e_area_mm2"))
        if explicit and explicit > 0:
            return explicit
        diameter = _optional_float(container.get("virtual_filament_diameter_mm"))
        if diameter and diameter > 0:
            return math.pi * (diameter / 2.0) ** 2
    return math.pi * (DEFAULT_VIRTUAL_FILAMENT_DIAMETER_MM / 2.0) ** 2


def _slicer_nozzle(material: dict[str, Any], override: float | None) -> float:
    if override is not None:
        return float(override)
    paste = material.get("paste", {})
    if isinstance(paste, dict):
        nozzle = _optional_float(paste.get("nozzle_diameter_mm"))
        if nozzle and nozzle > 0:
            return nozzle
    line_width = _optional_float(material.get("line_width_mm"))
    if line_width and line_width > 0:
        return line_width
    return DEFAULT_VIRTUAL_FILAMENT_DIAMETER_MM


def _optional_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _xy_extrusion_bounds(lines: list[str]) -> tuple[float, float, float, float] | None:
    x = 0.0
    y = 0.0
    absolute_xy = True
    absolute_e = True
    e_value = 0.0
    points: list[tuple[float, float]] = []

    for line in lines:
        code, _ = split_comment(line)
        command, params = parse_params(code)
        if command == "G90":
            absolute_xy = True
            continue
        if command == "G91":
            absolute_xy = False
            continue
        if command == "M82":
            absolute_e = True
            continue
        if command == "M83":
            absolute_e = False
            continue
        if command == "G92" and "E" in params:
            e_value = params["E"]
            continue
        if command not in {"G0", "G1"}:
            continue

        previous = (x, y)
        next_x = params.get("X", 0.0) + x if not absolute_xy and "X" in params else params.get("X", x)
        next_y = params.get("Y", 0.0) + y if not absolute_xy and "Y" in params else params.get("Y", y)
        has_xy = "X" in params or "Y" in params
        delta_e = 0.0
        if "E" in params:
            delta_e = params["E"] if not absolute_e else params["E"] - e_value
            e_value = e_value + delta_e if not absolute_e else params["E"]
        if has_xy and delta_e > 0:
            points.append(previous)
            points.append((next_x, next_y))
        x = next_x
        y = next_y

    if not points:
        return None
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return min(xs), max(xs), min(ys), max(ys)
