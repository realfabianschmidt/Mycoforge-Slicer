"""Nozzle synchronization helpers for Moonraker, Orca, and G-code checks."""

from __future__ import annotations

from dataclasses import dataclass
import json
import math
import re
from pathlib import Path
from typing import Any

from .moonraker_client import query_printer_object


MYCO_STATE_OBJECT = "gcode_macro MYCO_STATE"
DEFAULT_NOZZLE_PROFILE_MAP = (
    Path(__file__).resolve().parents[2] / "profiles" / "slicer" / "orca" / "nozzle_profiles.json"
)
NOZZLE_TOLERANCE_MM = 0.001


class NozzleSyncError(RuntimeError):
    """Raised when nozzle synchronization cannot produce a safe answer."""


@dataclass(frozen=True)
class NozzleProfile:
    nozzle_diameter_mm: float
    profile_name: str
    line_width_mm: float
    layer_height_mm: float
    print_speed_mm_s: float | None = None
    max_volumetric_flow_mm3_s: float | None = None


def query_printer_nozzle(base_url: str, timeout: int = 10) -> float:
    result = query_printer_object(base_url, MYCO_STATE_OBJECT, timeout=timeout)
    if not result.get("ok"):
        raise NozzleSyncError(f"Moonraker nozzle query failed: {result.get('error')}")
    return extract_nozzle_from_query_payload(result.get("data"))


def extract_nozzle_from_query_payload(payload: Any) -> float:
    if not isinstance(payload, dict):
        raise NozzleSyncError("Moonraker response is not a JSON object.")

    status = payload.get("result", {}).get("status") if isinstance(payload.get("result"), dict) else None
    if not isinstance(status, dict):
        raise NozzleSyncError("Moonraker response has no printer object status.")

    state = status.get(MYCO_STATE_OBJECT)
    if not isinstance(state, dict):
        raise NozzleSyncError("Moonraker object 'gcode_macro MYCO_STATE' is missing.")

    for key in ("variable_nozzle_diameter", "nozzle_diameter"):
        if key in state:
            return _float_or_error(state[key], f"Moonraker nozzle value '{key}' is not a number.")

    raise NozzleSyncError("MYCO_STATE has no nozzle diameter variable.")


def load_nozzle_profiles(path: str | Path = DEFAULT_NOZZLE_PROFILE_MAP) -> dict[float, NozzleProfile]:
    profile_path = Path(path)
    payload = json.loads(profile_path.read_text(encoding="utf-8"))
    entries = payload.get("profiles") if isinstance(payload, dict) else None
    if not isinstance(entries, list):
        raise NozzleSyncError(f"Nozzle profile map must contain a profiles list: {profile_path}")

    profiles: dict[float, NozzleProfile] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            raise NozzleSyncError(f"Invalid nozzle profile entry in {profile_path}")
        nozzle = _float_or_error(entry.get("nozzle_diameter_mm"), "Invalid nozzle diameter in profile map.")
        profiles[nozzle] = NozzleProfile(
            nozzle_diameter_mm=nozzle,
            profile_name=str(entry.get("profile_name") or ""),
            line_width_mm=_float_or_error(entry.get("line_width_mm"), "Invalid line width in profile map."),
            layer_height_mm=_float_or_error(entry.get("layer_height_mm"), "Invalid layer height in profile map."),
            print_speed_mm_s=_optional_float(entry.get("print_speed_mm_s")),
            max_volumetric_flow_mm3_s=_optional_float(entry.get("max_volumetric_flow_mm3_s")),
        )
        if not profiles[nozzle].profile_name:
            raise NozzleSyncError(f"Missing Orca profile name for nozzle {nozzle:g}.")
    return profiles


def profile_for_nozzle(
    nozzle_diameter_mm: float,
    profiles: dict[float, NozzleProfile] | None = None,
) -> NozzleProfile:
    available = profiles or load_nozzle_profiles()
    for nozzle, profile in available.items():
        if math.isclose(nozzle, nozzle_diameter_mm, abs_tol=NOZZLE_TOLERANCE_MM):
            return profile
    supported = ", ".join(f"{value:g}" for value in sorted(available))
    raise NozzleSyncError(
        f"No Orca nozzle profile mapping for {nozzle_diameter_mm:g} mm. Supported nozzles: {supported}."
    )


def parse_gcode_slicer_nozzle(lines: list[str]) -> float:
    candidates: list[float] = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(";"):
            match = re.search(r"\bslicer_nozzle_mm\s*=\s*([0-9]+(?:\.[0-9]+)?)", stripped, re.I)
            if match:
                candidates.append(float(match.group(1)))
            continue
        if stripped.upper().startswith("START_PRINT"):
            params = _parse_start_print_params(stripped)
            if "NOZZLE" in params:
                candidates.append(_float_or_error(params["NOZZLE"], "START_PRINT NOZZLE is not numeric."))

    unique: list[float] = []
    for candidate in candidates:
        if not any(math.isclose(candidate, known, abs_tol=NOZZLE_TOLERANCE_MM) for known in unique):
            unique.append(candidate)
    if not unique:
        raise NozzleSyncError("G-code has no explicit slicer nozzle. Expected '; slicer_nozzle_mm = ...' or START_PRINT NOZZLE=...")
    if len(unique) > 1:
        formatted = ", ".join(f"{value:g}" for value in unique)
        raise NozzleSyncError(f"G-code contains conflicting slicer nozzle values: {formatted}.")
    return unique[0]


def validate_gcode_nozzle(lines: list[str], printer_nozzle_mm: float) -> float:
    slicer_nozzle = parse_gcode_slicer_nozzle(lines)
    if not math.isclose(slicer_nozzle, printer_nozzle_mm, abs_tol=NOZZLE_TOLERANCE_MM):
        raise NozzleSyncError(
            f"Slicer nozzle {slicer_nozzle:g} does not match printer nozzle {printer_nozzle_mm:g}. "
            "Set printer nozzle or reslice."
        )
    return slicer_nozzle


def ensure_start_print_nozzle(lines: list[str]) -> float:
    start_lines = [line for line in lines if line.strip().upper().startswith("START_PRINT")]
    if len(start_lines) != 1:
        raise NozzleSyncError(
            "G-code must contain exactly one START_PRINT with NOZZLE; missing or ambiguous START_PRINT."
        )
    params = _parse_start_print_params(start_lines[0].strip())
    if "NOZZLE" not in params:
        raise NozzleSyncError("START_PRINT is missing required NOZZLE=<mm>.")
    return _float_or_error(params["NOZZLE"], "START_PRINT NOZZLE is not numeric.")


def _parse_start_print_params(line: str) -> dict[str, str]:
    params: dict[str, str] = {}
    for token in line.split()[1:]:
        if "=" not in token:
            continue
        key, value = token.split("=", 1)
        params[key.upper()] = value
    return params


def _float_or_error(value: Any, message: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise NozzleSyncError(message) from exc


def _optional_float(value: Any) -> float | None:
    if value is None:
        return None
    return _float_or_error(value, "Invalid optional numeric value.")
