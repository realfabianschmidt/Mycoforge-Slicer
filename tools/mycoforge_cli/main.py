"""Typer command surface for Mycoforge Studio."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

import typer

from .calibration_gcode import generate_calibration_gcode
from .flow_normalizer import normalize_feedrates
from .gcode_parser import parse_lines
from .layout_transform import (
    LayoutTransform,
    LayoutTransformError,
    apply_layout_transform,
    layout_transform_from_json,
    layout_transform_header,
)
from .moonraker_client import (
    discover_printers,
    get_print_readiness,
    get_printer_status,
    test_connection,
    upload_gcode,
)
from .bed_volume_sync import BedVolumeSyncError, query_printer_bed_volume
from .nozzle_sync import NozzleSyncError, query_printer_nozzle
from .paste_contract import (
    BED_MESH_MODE_ALWAYS,
    BED_MESH_MODES,
    build_mycoforge_footer,
    build_mycoforge_header,
    normalize_bed_mesh_mode,
    object_definition_from_gcode,
    safe_retraction_translation_mode,
)
from .profiles import load_profile, material_defaults
from .retraction_translator import translate_retractions
from .short_extrusion_filter import (
    ShortExtrusionStats,
    default_min_extrusion_path_mm,
    filter_short_extrusions as filter_short_extrusion_lines,
    short_extrusion_filter_header,
)
from .slicer_manager import SlicerManagerError, install_orca, set_custom_slicer, slicer_status, resolve_slicer
from .slicer_runner import SliceRequest, slice_model
from .validators import require_existing_file, require_parent_dir


app = typer.Typer(help="Mycoforge Studio CLI")
slicer_app = typer.Typer(help="Manage external slicer tools.")
app.add_typer(slicer_app, name="slicer")


@app.command()
def normalize_gcode(
    input_path: Path = typer.Argument(..., exists=True, readable=True),
    out: Path = typer.Option(..., "--out", "-o"),
    speed: float = typer.Option(15.0, "--speed", help="Target print speed in mm/s."),
) -> None:
    lines = input_path.read_text(encoding="utf-8").splitlines()
    parsed = parse_lines(lines)
    output = normalize_feedrates(parsed, speed)
    _write_lines(out, output)


@app.command()
def translate_retraction(
    input_path: Path = typer.Argument(..., exists=True, readable=True),
    out: Path = typer.Option(..., "--out", "-o"),
    mode: str = typer.Option("annotate_only", "--mode"),
    macro_mode: str = typer.Option("pcp_pressure_relief", "--macro-mode"),
) -> None:
    lines = input_path.read_text(encoding="utf-8").splitlines()
    parsed = parse_lines(lines)
    output = translate_retractions(parsed, mode, macro_mode)
    _write_lines(out, output)


@app.command()
def process_gcode(
    input_path: Path = typer.Argument(..., exists=True, readable=True),
    out: Path = typer.Option(..., "--out", "-o"),
    profile: Path = typer.Option(..., "--profile", exists=True, readable=True),
    nozzle_diameter: Optional[float] = typer.Option(None, "--nozzle-diameter"),
    filter_short_extrusions: bool = typer.Option(
        True,
        "--filter-short-extrusions/--no-filter-short-extrusions",
        help="Convert tiny XY extrusion moves into non-extruding travel moves.",
    ),
    min_extrusion_path: Optional[float] = typer.Option(None, "--min-extrusion-path"),
    bed_mesh: str = typer.Option(
        BED_MESH_MODE_ALWAYS,
        "--bed-mesh",
        help=f"Klipper bed-mesh strategy injected into START_PRINT: {', '.join(BED_MESH_MODES)}.",
    ),
) -> None:
    process_gcode_file(
        input_path,
        out,
        profile,
        slicer_nozzle_mm=nozzle_diameter,
        filter_short_extrusions=filter_short_extrusions,
        min_extrusion_path_mm=min_extrusion_path,
        bed_mesh_mode=_require_bed_mesh_mode(bed_mesh),
    )


@app.command("calibration-gcode")
def calibration_gcode(
    out: Path = typer.Option(..., "--out", "-o"),
    profile: Path = typer.Option(..., "--profile", exists=True, readable=True),
    pattern: str = typer.Option("flow_ladder", "--pattern"),
) -> None:
    material = material_defaults(load_profile(profile))
    try:
        output = generate_calibration_gcode(pattern, material)
    except ValueError as exc:
        _echo_json({"ok": False, "error": str(exc)})
        raise typer.Exit(code=1)
    _write_lines(out, output)
    _echo_json({"ok": True, "pattern": pattern, "output_path": str(out)})


@app.command()
def upload(
    file_path: Path = typer.Argument(..., exists=True, readable=True),
    moonraker: str = typer.Option(..., "--moonraker"),
    remote_name: Optional[str] = typer.Option(None, "--remote-name"),
) -> None:
    result = upload_gcode(moonraker, file_path, remote_name=remote_name, start_print=False)
    _echo_json(result)
    if not result.get("ok"):
        raise typer.Exit(code=1)


@app.command("print")
def print_file(
    file_path: Path = typer.Argument(..., exists=True, readable=True),
    moonraker: str = typer.Option(..., "--moonraker"),
    remote_name: Optional[str] = typer.Option(None, "--remote-name"),
) -> None:
    readiness = get_print_readiness(moonraker)
    if not readiness.get("ready"):
        result = {
            "ok": False,
            "stage": "print-readiness",
            "error": _readiness_error(readiness),
            "readiness": readiness,
        }
        _echo_json(result)
        raise typer.Exit(code=1)

    result = upload_gcode(moonraker, file_path, remote_name=remote_name, start_print=True)
    _echo_json(result)
    if not result.get("ok"):
        raise typer.Exit(code=1)


@app.command("print-readiness")
def print_readiness(
    moonraker: str = typer.Option(..., "--moonraker"),
    json_output: bool = typer.Option(False, "--json", help="Emit the readiness payload as JSON."),
) -> None:
    _ = json_output
    result = get_print_readiness(moonraker)
    _echo_json(result)
    if not result.get("ready"):
        raise typer.Exit(code=1)


@app.command()
def status(moonraker: str = typer.Option(..., "--moonraker")) -> None:
    result = get_printer_status(moonraker)
    _echo_json(result)
    if not result.get("ok"):
        raise typer.Exit(code=1)


@app.command("test-connection")
def test_connection_cmd(moonraker: str = typer.Option(..., "--moonraker")) -> None:
    ok = test_connection(moonraker)
    _echo_json({"ok": ok})
    if not ok:
        raise typer.Exit(code=1)


@app.command("discover-printers")
def discover_printers_cmd(
    moonraker_port: int = typer.Option(7125, "--moonraker-port"),
    control_port: int = typer.Option(8080, "--control-port"),
    timeout: float = typer.Option(0.25, "--timeout"),
    subnet: Optional[str] = typer.Option(None, "--subnet"),
    fallback_host: Optional[str] = typer.Option(None, "--fallback-host"),
) -> None:
    result = discover_printers(
        moonraker_port=moonraker_port,
        control_port=control_port,
        timeout=timeout,
        subnet=subnet,
        fallback_host=fallback_host,
    )
    _echo_json(result)
    if not result.get("ok"):
        raise typer.Exit(code=1)


@app.command("nozzle-query")
def nozzle_query(moonraker: str = typer.Option(..., "--moonraker")) -> None:
    try:
        nozzle = query_printer_nozzle(moonraker)
    except NozzleSyncError as exc:
        _echo_json({"ok": False, "error": str(exc)})
        raise typer.Exit(code=1)
    _echo_json({"ok": True, "nozzle_diameter": nozzle})


@app.command("bed-volume-query")
def bed_volume_query(moonraker: str = typer.Option(..., "--moonraker")) -> None:
    try:
        volume = query_printer_bed_volume(moonraker)
    except BedVolumeSyncError as exc:
        _echo_json({"ok": False, "error": str(exc)})
        raise typer.Exit(code=1)
    _echo_json({"ok": True, **volume.as_payload()})


@app.command()
def slice(
    model_path: Path = typer.Argument(..., exists=True, readable=True),
    out: Path = typer.Option(..., "--out", "-o"),
    slicer_binary: Optional[Path] = typer.Option(None, "--slicer-binary"),
    slicer_profile: Optional[Path] = typer.Option(None, "--slicer-profile"),
    layer_height: Optional[float] = typer.Option(None, "--layer-height"),
    line_width: Optional[float] = typer.Option(None, "--line-width"),
    print_speed: Optional[float] = typer.Option(None, "--print-speed"),
    nozzle_diameter: Optional[float] = typer.Option(None, "--nozzle-diameter"),
    vase_mode: bool = typer.Option(False, "--vase-mode/--no-vase-mode"),
    smooth_vase: bool = typer.Option(True, "--smooth-vase/--no-smooth-vase"),
    filter_short_extrusions: bool = typer.Option(True, "--filter-short-extrusions/--no-filter-short-extrusions"),
    min_extrusion_path: Optional[float] = typer.Option(None, "--min-extrusion-path"),
    travel_speed: Optional[float] = typer.Option(80.0, "--travel-speed"),
    wall_loops: int = typer.Option(3, "--wall-loops"),
    top_shell_layers: int = typer.Option(3, "--top-shell-layers"),
    bottom_shell_layers: int = typer.Option(3, "--bottom-shell-layers"),
    infill_density: float = typer.Option(15.0, "--infill-density"),
    printer_geometry_json: Optional[str] = typer.Option(None, "--printer-geometry-json"),
) -> None:
    try:
        printer_geometry = _printer_geometry_from_json(printer_geometry_json)
    except ValueError as exc:
        _echo_json({"ok": False, "stage": "printer-geometry", "error": str(exc)})
        raise typer.Exit(code=1)

    request = SliceRequest(
        model_path=require_existing_file(model_path, "model"),
        output_path=require_parent_dir(out),
        slicer_binary=require_existing_file(slicer_binary, "slicer binary") if slicer_binary else None,
        slicer_profile=slicer_profile,
        layer_height_mm=layer_height,
        line_width_mm=line_width,
        print_speed_mm_s=print_speed,
        nozzle_diameter_mm=nozzle_diameter,
        vase_mode=vase_mode,
        smooth_vase=smooth_vase,
        filter_short_extrusions=filter_short_extrusions,
        min_extrusion_path_mm=_resolve_min_extrusion_path(min_extrusion_path, line_width)
        if filter_short_extrusions
        else None,
        travel_speed_mm_s=travel_speed,
        wall_loops=wall_loops,
        top_shell_layers=top_shell_layers,
        bottom_shell_layers=bottom_shell_layers,
        infill_density_percent=infill_density,
        printer_geometry=printer_geometry,
    )
    result = slice_model(request)
    _echo_json(result)
    if not result.get("ok"):
        raise typer.Exit(code=1)


@app.command()
def slice_process(
    model_path: Path = typer.Argument(..., exists=True, readable=True),
    out: Path = typer.Option(..., "--out", "-o"),
    profile: Path = typer.Option(..., "--profile", exists=True, readable=True),
    slicer_binary: Optional[Path] = typer.Option(None, "--slicer-binary"),
    slicer_profile: Optional[Path] = typer.Option(None, "--slicer-profile"),
    layer_height: Optional[float] = typer.Option(None, "--layer-height"),
    line_width: Optional[float] = typer.Option(None, "--line-width"),
    print_speed: Optional[float] = typer.Option(None, "--print-speed"),
    layout_transform_json: Optional[str] = typer.Option(None, "--layout-transform-json"),
    moonraker_url: Optional[str] = typer.Option(None, "--moonraker-url"),
    sync_printer_nozzle: bool = typer.Option(False, "--sync-printer-nozzle"),
    nozzle_diameter: Optional[float] = typer.Option(None, "--nozzle-diameter"),
    vase_mode: bool = typer.Option(False, "--vase-mode/--no-vase-mode"),
    smooth_vase: bool = typer.Option(True, "--smooth-vase/--no-smooth-vase"),
    filter_short_extrusions: bool = typer.Option(True, "--filter-short-extrusions/--no-filter-short-extrusions"),
    min_extrusion_path: Optional[float] = typer.Option(None, "--min-extrusion-path"),
    travel_speed: Optional[float] = typer.Option(None, "--travel-speed"),
    wall_loops: int = typer.Option(3, "--wall-loops"),
    top_shell_layers: int = typer.Option(3, "--top-shell-layers"),
    bottom_shell_layers: int = typer.Option(3, "--bottom-shell-layers"),
    infill_density: float = typer.Option(15.0, "--infill-density"),
    printer_geometry_json: Optional[str] = typer.Option(None, "--printer-geometry-json"),
    bed_mesh: str = typer.Option(
        BED_MESH_MODE_ALWAYS,
        "--bed-mesh",
        help=f"Klipper bed-mesh strategy injected into START_PRINT: {', '.join(BED_MESH_MODES)}.",
    ),
) -> None:
    bed_mesh_mode = _require_bed_mesh_mode(bed_mesh)
    try:
        layout_transform = layout_transform_from_json(layout_transform_json)
    except LayoutTransformError as exc:
        _echo_json({"ok": False, "stage": "layout-transform", "error": str(exc)})
        raise typer.Exit(code=1)

    try:
        printer_geometry = _printer_geometry_from_json(printer_geometry_json)
    except ValueError as exc:
        _echo_json({"ok": False, "stage": "printer-geometry", "error": str(exc)})
        raise typer.Exit(code=1)

    try:
        slicer_nozzle_mm = _resolve_slicer_nozzle(
            nozzle_diameter=nozzle_diameter,
            moonraker_url=moonraker_url,
            sync_printer_nozzle=sync_printer_nozzle,
        )
    except NozzleSyncError as exc:
        _echo_json({"ok": False, "stage": "nozzle-sync", "error": str(exc)})
        raise typer.Exit(code=1)

    material = material_defaults(load_profile(profile))
    effective_line_width = line_width if line_width is not None else material["line_width_mm"]
    effective_min_path = (
        _resolve_min_extrusion_path(min_extrusion_path, effective_line_width)
        if filter_short_extrusions
        else None
    )
    effective_travel_speed = (
        travel_speed if travel_speed is not None else float(material.get("travel_speed_mm_s") or 80.0)
    )

    raw_out = out.with_name(f"{out.stem}.slicer_raw.gcode")
    request = SliceRequest(
        model_path=require_existing_file(model_path, "model"),
        output_path=require_parent_dir(raw_out),
        slicer_binary=require_existing_file(slicer_binary, "slicer binary") if slicer_binary else None,
        slicer_profile=slicer_profile,
        layer_height_mm=layer_height,
        line_width_mm=line_width,
        print_speed_mm_s=print_speed,
        nozzle_diameter_mm=slicer_nozzle_mm,
        vase_mode=vase_mode,
        smooth_vase=smooth_vase,
        filter_short_extrusions=filter_short_extrusions,
        min_extrusion_path_mm=effective_min_path,
        travel_speed_mm_s=effective_travel_speed,
        wall_loops=wall_loops,
        top_shell_layers=top_shell_layers,
        bottom_shell_layers=bottom_shell_layers,
        infill_density_percent=infill_density,
        printer_geometry=printer_geometry,
    )
    slice_result = slice_model(request)
    if not slice_result.get("ok"):
        _echo_json({"ok": False, "stage": "slice", "slice": slice_result})
        raise typer.Exit(code=1)

    try:
        process_gcode_file(
            raw_out,
            out,
            profile,
            layout_transform=layout_transform,
            slicer_nozzle_mm=slicer_nozzle_mm,
            filter_short_extrusions=filter_short_extrusions,
            min_extrusion_path_mm=effective_min_path,
            bed_mesh_mode=bed_mesh_mode,
        )
    except LayoutTransformError as exc:
        _echo_json(
            {
                "ok": False,
                "stage": "layout-transform",
                "error": str(exc),
                "raw_gcode_path": str(raw_out),
                "output_path": str(out),
                "slice": slice_result,
            }
        )
        raise typer.Exit(code=1)

    _echo_json(
        {
            "ok": True,
            "stage": "slice-process",
            "raw_gcode_path": str(raw_out),
            "output_path": str(out),
            "slice": slice_result,
            "slicer_nozzle_mm": slicer_nozzle_mm,
        }
    )


@slicer_app.command("status")
def slicer_status_cmd() -> None:
    _echo_json(slicer_status())


@slicer_app.command("install-orca")
def slicer_install_orca(version: str = typer.Option("latest", "--version")) -> None:
    try:
        result = install_orca(version)
    except SlicerManagerError as exc:
        _echo_json({"ok": False, "error": str(exc)})
        raise typer.Exit(code=1)
    _echo_json(result)


@slicer_app.command("set-custom")
def slicer_set_custom(path: Path = typer.Option(..., "--path", exists=True, readable=True)) -> None:
    try:
        result = set_custom_slicer(path)
    except (OSError, SlicerManagerError) as exc:
        _echo_json({"ok": False, "error": str(exc)})
        raise typer.Exit(code=1)
    _echo_json(result)


@slicer_app.command("resolve")
def slicer_resolve_cmd() -> None:
    resolved = resolve_slicer()
    result = {"ok": resolved.path is not None, "resolution": resolved.as_dict()}
    _echo_json(result)
    if resolved.path is None:
        raise typer.Exit(code=1)


def process_gcode_file(
    input_path: Path,
    out: Path,
    profile: Path,
    *,
    layout_transform: LayoutTransform | None = None,
    slicer_nozzle_mm: float | None = None,
    filter_short_extrusions: bool = True,
    min_extrusion_path_mm: float | None = None,
    bed_mesh_mode: str = BED_MESH_MODE_ALWAYS,
) -> None:
    material = material_defaults(load_profile(profile))
    lines = input_path.read_text(encoding="utf-8").splitlines()
    lines = apply_layout_transform(lines, layout_transform)

    if material["flow"].get("normalize_print_feedrate", True):
        parsed = parse_lines(lines)
        lines = normalize_feedrates(parsed, material["print_speed_mm_s"])

    parsed = parse_lines(lines)
    retraction = material["retraction"]
    if retraction.get("enabled", True):
        lines = translate_retractions(
            parsed,
            safe_retraction_translation_mode(material),
            retraction.get("mode", "pcp_pressure_relief"),
        )

    short_filter_stats = _apply_short_extrusion_filter(
        lines,
        enabled=filter_short_extrusions,
        min_path_mm=min_extrusion_path_mm,
        line_width_mm=material["line_width_mm"],
    )
    lines, filter_stats = short_filter_stats

    object_definition = object_definition_from_gcode(lines, input_path)
    output = (
        build_mycoforge_header(
            material,
            object_definition=object_definition,
            slicer_nozzle_mm=slicer_nozzle_mm,
            bed_mesh_mode=bed_mesh_mode,
        )
        + layout_transform_header(layout_transform)
        + short_extrusion_filter_header(filter_stats)
        + lines
    )
    output.extend(build_mycoforge_footer(material))
    _write_lines(out, output)


def _write_lines(path: Path, lines: list[str]) -> None:
    require_parent_dir(path)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _echo_json(payload: object) -> None:
    typer.echo(json.dumps(payload, indent=2, sort_keys=True))


def _readiness_error(readiness: dict[str, object]) -> str:
    reasons = readiness.get("reasons")
    if isinstance(reasons, list) and reasons:
        return "Printer is not ready to start: " + "; ".join(str(reason) for reason in reasons)
    return str(readiness.get("error") or "Printer is not ready to start.")


def _resolve_slicer_nozzle(
    *,
    nozzle_diameter: float | None,
    moonraker_url: str | None,
    sync_printer_nozzle: bool,
) -> float | None:
    if nozzle_diameter is not None:
        return nozzle_diameter
    if not sync_printer_nozzle:
        return None
    if not moonraker_url:
        raise NozzleSyncError("--sync-printer-nozzle requires --moonraker-url.")
    return query_printer_nozzle(moonraker_url)


def _resolve_min_extrusion_path(value: float | None, line_width_mm: float | None) -> float:
    if value is not None:
        return value
    return default_min_extrusion_path_mm(line_width_mm)


def _printer_geometry_from_json(raw: str | None) -> dict[str, Any] | None:
    if raw is None or not raw.strip():
        return None
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid printer geometry JSON: {exc.msg}") from exc
    if not isinstance(payload, dict):
        raise ValueError("Printer geometry JSON must be an object.")
    return payload


def _require_bed_mesh_mode(value: str) -> str:
    candidate = (value or "").strip().lower()
    if candidate not in BED_MESH_MODES:
        _echo_json(
            {
                "ok": False,
                "stage": "bed-mesh",
                "error": f"--bed-mesh must be one of {', '.join(BED_MESH_MODES)} (got '{value}').",
            }
        )
        raise typer.Exit(code=2)
    return normalize_bed_mesh_mode(candidate)


def _apply_short_extrusion_filter(
    lines: list[str],
    *,
    enabled: bool,
    min_path_mm: float | None,
    line_width_mm: float | None,
) -> tuple[list[str], ShortExtrusionStats]:
    threshold = _resolve_min_extrusion_path(min_path_mm, line_width_mm)
    if not enabled:
        return lines, ShortExtrusionStats(enabled=False, min_extrusion_path_mm=threshold)
    return filter_short_extrusion_lines(lines, min_path_mm=threshold)


if __name__ == "__main__":
    app()
