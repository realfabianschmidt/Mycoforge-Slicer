"""External slicer CLI integration."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
from typing import Any

from .slicer_manager import SlicerManagerError, project_root, resolve_slicer
from .validators import require_existing_file, require_parent_dir


ORCA_DIALECT = "orca"
PRUSA_DIALECT = "prusaslicer"
ORCA_PROFILE_DIR = project_root() / "profiles" / "slicer" / "orca"
ORCA_MACHINE_MODEL_PROFILE = ORCA_PROFILE_DIR / "mycoforge_klipper_250_machine_model.json"
ORCA_MACHINE_PROFILE = ORCA_PROFILE_DIR / "mycoforge_klipper_250_5mm_machine.json"
ORCA_PROCESS_PROFILE = ORCA_PROFILE_DIR / "mycoforge_klipper_250_5mm_process.json"
ORCA_FILAMENT_PROFILE = ORCA_PROFILE_DIR / "mycoforge_paste_filament.json"
ORCA_PROFILE_COMPATIBILITY_ERROR = "process not compatible with printer"
ORCA_MACHINE_MODEL_NAME = "Mycoforge Klipper 250"


@dataclass(frozen=True)
class SliceRequest:
    model_path: Path
    output_path: Path
    slicer_binary: Path | None = None
    slicer_profile: Path | None = None
    layer_height_mm: float | None = None
    line_width_mm: float | None = None
    print_speed_mm_s: float | None = None
    nozzle_diameter_mm: float | None = None
    vase_mode: bool = False
    smooth_vase: bool = True
    filter_short_extrusions: bool = False
    min_extrusion_path_mm: float | None = None
    travel_speed_mm_s: float | None = None
    wall_loops: int | None = None
    top_shell_layers: int | None = None
    bottom_shell_layers: int | None = None
    infill_density_percent: float | None = None
    printer_geometry: dict[str, Any] | None = None


def build_slicer_command(
    request: SliceRequest,
    *,
    dialect: str | None = None,
    output_dir: Path | None = None,
    slicer_binary: Path | None = None,
    orca_machine_model_profile: Path | None = None,
    orca_machine_profile: Path | None = None,
    orca_process_profile: Path | None = None,
    orca_filament_profile: Path | None = None,
) -> list[str]:
    if slicer_binary is not None:
        binary = slicer_binary
        resolved_dialect = _detect_slicer_dialect(binary, None)
    elif request.slicer_binary is not None:
        binary = request.slicer_binary
        resolved_dialect = _detect_slicer_dialect(binary, None)
    else:
        binary, resolved_dialect = _resolve_request_slicer(request)

    selected_dialect = dialect or resolved_dialect
    if selected_dialect == ORCA_DIALECT:
        return _build_orca_command(
            request,
            binary,
            output_dir or request.output_path.parent,
            orca_machine_model_profile or ORCA_MACHINE_MODEL_PROFILE,
            orca_machine_profile or ORCA_MACHINE_PROFILE,
            orca_process_profile or ORCA_PROCESS_PROFILE,
            orca_filament_profile or ORCA_FILAMENT_PROFILE,
        )
    return _build_prusa_command(request, binary)


def _build_prusa_command(request: SliceRequest, slicer_binary: Path) -> list[str]:
    command = [
        str(slicer_binary),
        "--export-gcode",
        "--output",
        str(request.output_path),
    ]

    if request.slicer_profile is not None:
        command.extend(["--load", str(request.slicer_profile)])
    if request.layer_height_mm is not None:
        command.extend(["--layer-height", str(request.layer_height_mm)])
    if request.line_width_mm is not None:
        command.extend(["--extrusion-width", str(request.line_width_mm)])
    if request.print_speed_mm_s is not None:
        command.extend(["--perimeter-speed", str(request.print_speed_mm_s)])

    command.append(str(request.model_path))
    return command


def _build_orca_command(
    request: SliceRequest,
    slicer_binary: Path,
    output_dir: Path,
    machine_model_profile: Path,
    machine_profile: Path,
    process_profile: Path,
    filament_profile: Path,
) -> list[str]:
    # OrcaSlicer 2.3.x rejects machine_model JSON in --load-settings with
    # "unknown config type machine_model". Keep the machine_model profile in the
    # repo for preset consistency checks, but load only machine + process here.
    _ = machine_model_profile
    settings_arg = f"{machine_profile};{process_profile}"
    return [
        str(slicer_binary),
        "--slice",
        "0",
        "--outputdir",
        str(output_dir),
        "--load-settings",
        settings_arg,
        "--load-filaments",
        str(filament_profile),
        str(request.model_path),
    ]


def slice_model(request: SliceRequest, timeout: int | None = None) -> dict[str, object]:
    require_existing_file(request.model_path, "model")
    try:
        slicer_binary, dialect = _resolve_request_slicer(request)
    except SlicerManagerError as exc:
        return {"ok": False, "error": str(exc)}
    require_existing_file(slicer_binary, "slicer binary")
    request = SliceRequest(
        model_path=request.model_path,
        output_path=request.output_path,
        slicer_binary=slicer_binary,
        slicer_profile=request.slicer_profile,
        layer_height_mm=request.layer_height_mm,
        line_width_mm=request.line_width_mm,
        print_speed_mm_s=request.print_speed_mm_s,
        nozzle_diameter_mm=request.nozzle_diameter_mm,
        vase_mode=request.vase_mode,
        smooth_vase=request.smooth_vase,
        filter_short_extrusions=request.filter_short_extrusions,
        min_extrusion_path_mm=request.min_extrusion_path_mm,
        travel_speed_mm_s=request.travel_speed_mm_s,
        wall_loops=request.wall_loops,
        top_shell_layers=request.top_shell_layers,
        bottom_shell_layers=request.bottom_shell_layers,
        infill_density_percent=request.infill_density_percent,
        printer_geometry=request.printer_geometry,
    )
    if dialect == PRUSA_DIALECT and request.slicer_profile is not None:
        require_existing_file(request.slicer_profile, "slicer profile")
    require_parent_dir(request.output_path)

    if dialect == ORCA_DIALECT:
        return _slice_with_orca(request, timeout)

    command = build_slicer_command(request, dialect=PRUSA_DIALECT, slicer_binary=slicer_binary)
    try:
        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return {"ok": False, "error": str(exc), "command": command}

    return {
        "ok": completed.returncode == 0 and request.output_path.exists(),
        "returncode": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "command": command,
        "output_path": str(request.output_path),
    }


def _slice_with_orca(request: SliceRequest, timeout: int | None = None) -> dict[str, object]:
    for profile in [ORCA_MACHINE_MODEL_PROFILE, ORCA_MACHINE_PROFILE, ORCA_FILAMENT_PROFILE]:
        require_existing_file(profile, "Orca profile")

    output_dir = Path(
        tempfile.mkdtemp(
            prefix=f"{request.output_path.stem}.orca-",
            dir=request.output_path.parent,
        )
    )
    command: list[str] = []
    try:
        profiles = _write_orca_profile_bundle(request, output_dir)
        command = build_slicer_command(
            request,
            dialect=ORCA_DIALECT,
            output_dir=output_dir,
            slicer_binary=request.slicer_binary,
            orca_machine_model_profile=profiles["machine_model"],
            orca_machine_profile=profiles["machine"],
            orca_process_profile=profiles["process"],
            orca_filament_profile=profiles["filament"],
        )
        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except (OSError, subprocess.SubprocessError, ValueError, FileNotFoundError) as exc:
        return {
            "ok": False,
            "error": str(exc),
            "command": command,
            "output_path": str(request.output_path),
            "orca_output_dir": str(output_dir),
        }

    if completed.returncode != 0:
        return _orca_failure_result(
            request,
            output_dir,
            command,
            completed.returncode,
            completed.stdout,
            completed.stderr,
            _orca_returncode_error(completed.stdout, completed.stderr, output_dir),
        )

    gcode_files = sorted(path for path in output_dir.rglob("*.gcode") if path.is_file())
    if len(gcode_files) != 1:
        message = (
            f"No G-code file was produced in Orca output directory: {output_dir}"
            if not gcode_files
            else f"Expected one G-code file in Orca output directory, found {len(gcode_files)}: {output_dir}"
        )
        return _orca_failure_result(
            request,
            output_dir,
            command,
            completed.returncode,
            completed.stdout,
            completed.stderr,
            message,
        )

    request.output_path.unlink(missing_ok=True)
    shutil.move(str(gcode_files[0]), str(request.output_path))
    shutil.rmtree(output_dir, ignore_errors=True)
    return {
        "ok": request.output_path.exists(),
        "returncode": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "command": command,
        "output_path": str(request.output_path),
        "orca_output_dir": str(output_dir),
    }


def _orca_failure_result(
    request: SliceRequest,
    output_dir: Path,
    command: list[str],
    returncode: int,
    stdout: str,
    stderr: str,
    error: str,
) -> dict[str, object]:
    return {
        "ok": False,
        "error": error,
        "returncode": returncode,
        "stdout": stdout,
        "stderr": stderr,
        "command": command,
        "output_path": str(request.output_path),
        "orca_output_dir": str(output_dir),
    }


def _orca_returncode_error(stdout: str, stderr: str, output_dir: Path) -> str:
    output = f"{stdout}\n{stderr}".lower()
    if ORCA_PROFILE_COMPATIBILITY_ERROR in output:
        return (
            "OrcaSlicer rejected the built-in Mycoforge Orca profiles as incompatible. "
            f"Inspect the generated process profile in the Orca output directory: {output_dir}"
        )
    return "OrcaSlicer failed before producing G-code."


def _resolve_request_slicer(request: SliceRequest) -> tuple[Path, str]:
    if request.slicer_binary is not None:
        binary = require_existing_file(request.slicer_binary, "slicer binary")
        return binary, _detect_slicer_dialect(binary, None)

    resolved = resolve_slicer()
    if resolved.path is None:
        raise SlicerManagerError(
            "No slicer is configured. Run `mycoforge slicer install-orca` or `mycoforge slicer set-custom --path <exe>`."
        )
    return resolved.path, _detect_slicer_dialect(resolved.path, resolved.source)


def _detect_slicer_dialect(path: Path, source: str | None) -> str:
    if source == ORCA_DIALECT or "orca" in path.name.lower():
        return ORCA_DIALECT
    return PRUSA_DIALECT


def _write_orca_profile_bundle(request: SliceRequest, output_dir: Path) -> dict[str, Path]:
    machine_model = _load_json_object(ORCA_MACHINE_MODEL_PROFILE)
    machine = _load_json_object(ORCA_MACHINE_PROFILE)
    process = _load_orca_process_profile(request)
    filament = _load_json_object(ORCA_FILAMENT_PROFILE)

    nozzle = request.nozzle_diameter_mm
    machine_name = _orca_machine_name(nozzle)
    _apply_orca_machine_model_overrides(machine_model, nozzle)
    _apply_orca_machine_overrides(machine, nozzle, machine_name, request.printer_geometry)
    _apply_orca_process_overrides(process, request, machine_name)
    _apply_orca_filament_overrides(filament, machine_name)

    paths = {
        "machine_model": output_dir / "mycoforge_orca_machine_model.generated.json",
        "machine": output_dir / "mycoforge_orca_machine.generated.json",
        "process": output_dir / "mycoforge_orca_process.generated.json",
        "filament": output_dir / "mycoforge_orca_filament.generated.json",
    }
    for key, path in paths.items():
        payload = {
            "machine_model": machine_model,
            "machine": machine,
            "process": process,
            "filament": filament,
        }[key]
        path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return paths


def _load_orca_process_profile(request: SliceRequest) -> dict[str, Any]:
    source_profile = request.slicer_profile or ORCA_PROCESS_PROFILE
    source_profile = require_existing_file(source_profile, "Orca process profile")
    if source_profile.suffix.lower() != ".json":
        raise ValueError(
            "Orca slicer profiles must be JSON files. Leave --slicer-profile unset to use the built-in Mycoforge Orca profile."
        )
    return _load_json_object(source_profile)


def _load_json_object(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Orca process profile is not valid JSON: {path}") from exc
    if not isinstance(payload, dict):
        raise ValueError(f"Orca process profile must contain a JSON object: {path}")
    return payload


def _apply_orca_machine_model_overrides(profile: dict[str, Any], nozzle_diameter_mm: float | None) -> None:
    if nozzle_diameter_mm is not None:
        profile["nozzle_diameter"] = _format_float(nozzle_diameter_mm)


def _apply_orca_machine_overrides(
    profile: dict[str, Any],
    nozzle_diameter_mm: float | None,
    machine_name: str,
    printer_geometry: dict[str, Any] | None = None,
) -> None:
    profile["name"] = machine_name
    profile["printer_model"] = ORCA_MACHINE_MODEL_NAME
    if nozzle_diameter_mm is not None:
        value = _format_float(nozzle_diameter_mm)
        profile["nozzle_diameter"] = [value]
        profile["printer_variant"] = value
        profile["setting_id"] = f"GM_MYCOFORGE_KLIPPER_250_{_profile_id_nozzle(nozzle_diameter_mm)}"
    envelope = _print_envelope_from_geometry(printer_geometry)
    if envelope is not None:
        x_min, x_max, y_min, y_max, z_min, z_max = envelope
        profile["printable_area"] = [
            f"{_format_float(x_min)}x{_format_float(y_min)}",
            f"{_format_float(x_max)}x{_format_float(y_min)}",
            f"{_format_float(x_max)}x{_format_float(y_max)}",
            f"{_format_float(x_min)}x{_format_float(y_max)}",
        ]
        profile["printable_height"] = _format_float(z_max - z_min)


def _apply_orca_process_overrides(
    profile: dict[str, Any],
    request: SliceRequest,
    machine_name: str | None = None,
) -> None:
    if machine_name is not None:
        profile["compatible_printers"] = [machine_name, "fdm_klipper_common"]
        profile["compatible_printers_condition"] = ""

    if request.layer_height_mm is not None:
        value = _format_float(request.layer_height_mm)
        profile["layer_height"] = value
        profile["initial_layer_print_height"] = value

    if request.line_width_mm is not None:
        value = _format_float(request.line_width_mm)
        for key in [
            "line_width",
            "outer_wall_line_width",
            "inner_wall_line_width",
            "internal_solid_infill_line_width",
            "sparse_infill_line_width",
            "top_surface_line_width",
            "support_line_width",
            "initial_layer_line_width",
        ]:
            profile[key] = value

    if request.print_speed_mm_s is not None:
        value = _format_float(request.print_speed_mm_s)
        for key in [
            "outer_wall_speed",
            "inner_wall_speed",
            "internal_solid_infill_speed",
            "top_surface_speed",
            "gap_infill_speed",
            "sparse_infill_speed",
            "support_speed",
            "initial_layer_speed",
            "initial_layer_infill_speed",
        ]:
            profile[key] = value

    if request.travel_speed_mm_s is not None:
        profile["travel_speed"] = _format_float(request.travel_speed_mm_s)

    if request.filter_short_extrusions and request.min_extrusion_path_mm is not None:
        profile["filter_out_gap_fill"] = _format_float(request.min_extrusion_path_mm)

    if request.vase_mode:
        profile["spiral_mode"] = "1"
        profile["spiral_mode_smooth"] = "1" if request.smooth_vase else "0"
        profile["wall_loops"] = "1"
        profile["top_shell_layers"] = "0"
        profile["bottom_shell_layers"] = _format_int(request.bottom_shell_layers, fallback=1)
        profile["sparse_infill_density"] = "0%"
        profile["enable_support"] = "0"
    else:
        if request.wall_loops is not None:
            profile["wall_loops"] = _format_int(request.wall_loops, fallback=3)
        if request.top_shell_layers is not None:
            profile["top_shell_layers"] = _format_int(request.top_shell_layers, fallback=3)
        if request.bottom_shell_layers is not None:
            profile["bottom_shell_layers"] = _format_int(request.bottom_shell_layers, fallback=3)
        if request.infill_density_percent is not None:
            profile["sparse_infill_density"] = f"{_format_float(request.infill_density_percent)}%"


def _apply_orca_filament_overrides(profile: dict[str, Any], machine_name: str) -> None:
    profile["compatible_printers"] = [machine_name, "fdm_klipper_common"]
    profile["compatible_printers_condition"] = ""
    profile["filament_diameter"] = ["5"]


def _orca_machine_name(nozzle_diameter_mm: float | None) -> str:
    nozzle = 5.0 if nozzle_diameter_mm is None else nozzle_diameter_mm
    return f"Mycoforge Klipper 250 {_format_float(nozzle)}mm"


def _profile_id_nozzle(nozzle_diameter_mm: float) -> str:
    return _format_float(nozzle_diameter_mm).replace(".", "_")


def _print_envelope_from_geometry(
    printer_geometry: dict[str, Any] | None,
) -> tuple[float, float, float, float, float, float] | None:
    if not isinstance(printer_geometry, dict):
        return None

    envelope = printer_geometry.get("print_envelope")
    if isinstance(envelope, dict):
        x = _axis_from_envelope(envelope.get("x"))
        y = _axis_from_envelope(envelope.get("y"))
        z = _axis_from_envelope(envelope.get("z"))
        if x is not None and y is not None and z is not None:
            x_min, x_max = x
            y_min, y_max = y
            z_min, z_max = z
            if x_max > x_min and y_max > y_min and z_max > z_min:
                return x_min, x_max, y_min, y_max, z_min, z_max

    x_min = _number_field(printer_geometry, "min_x_mm")
    x_max = _number_field(printer_geometry, "max_x_mm")
    y_min = _number_field(printer_geometry, "min_y_mm")
    y_max = _number_field(printer_geometry, "max_y_mm")
    z_min = _number_field(printer_geometry, "min_z_mm")
    z_max = _number_field(printer_geometry, "max_z_mm")
    if None in {x_min, x_max, y_min, y_max, z_min, z_max}:
        return None
    assert x_min is not None and x_max is not None
    assert y_min is not None and y_max is not None
    assert z_min is not None and z_max is not None
    if x_max <= x_min or y_max <= y_min or z_max <= z_min:
        return None
    return x_min, x_max, y_min, y_max, z_min, z_max


def _axis_from_envelope(value: Any) -> tuple[float, float] | None:
    if not isinstance(value, dict):
        return None
    minimum = _number_field(value, "min_mm")
    maximum = _number_field(value, "max_mm")
    if minimum is None or maximum is None or maximum <= minimum:
        return None
    return minimum, maximum


def _number_field(payload: dict[str, Any], key: str) -> float | None:
    value = payload.get(key)
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
        return number if number == number else None
    if isinstance(value, str):
        try:
            number = float(value)
        except ValueError:
            return None
        return number if number == number else None
    return None


def _format_float(value: float) -> str:
    return f"{value:g}"


def _format_int(value: int | None, *, fallback: int) -> str:
    if value is None:
        return str(fallback)
    return str(max(0, int(value)))
