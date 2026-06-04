"""Pull Mycoforge printer geometry from a Klipper/Moonraker host.

The desktop UI calls this to sync its 3D editor, Orca machine profile and
bounds-checks with the real printer geometry. Mycoforge printers expose
`gcode_macro _myco_geometry` as the source of truth; generic Klipper
toolhead/configfile limits are only fallbacks because they describe the
mechanical movement envelope, not necessarily the printable envelope.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .moonraker_client import query_printer_objects


TOOLHEAD_OBJECT = "toolhead"
CONFIGFILE_OBJECT = "configfile"
MYCO_GEOMETRY_OBJECT = "gcode_macro _myco_geometry"


@dataclass(frozen=True)
class AxisEnvelope:
    min_mm: float
    max_mm: float

    @property
    def size_mm(self) -> float:
        return round(self.max_mm - self.min_mm, 3)


@dataclass(frozen=True)
class GeometryEnvelope:
    x: AxisEnvelope
    y: AxisEnvelope
    z: AxisEnvelope

    @property
    def size_x_mm(self) -> float:
        return self.x.size_mm

    @property
    def size_y_mm(self) -> float:
        return self.y.size_mm

    @property
    def height_z_mm(self) -> float:
        return self.z.size_mm

    def as_payload(self) -> dict[str, dict[str, float]]:
        return {
            "x": {"min_mm": self.x.min_mm, "max_mm": self.x.max_mm},
            "y": {"min_mm": self.y.min_mm, "max_mm": self.y.max_mm},
            "z": {"min_mm": self.z.min_mm, "max_mm": self.z.max_mm},
        }


@dataclass(frozen=True)
class BedVolume:
    size_x_mm: float
    size_y_mm: float
    height_z_mm: float
    kinematics: str
    source: str  # "myco_geometry", "toolhead" or "configfile"
    print_envelope: GeometryEnvelope
    move_envelope: GeometryEnvelope

    @property
    def min_x_mm(self) -> float:
        return self.print_envelope.x.min_mm

    @property
    def max_x_mm(self) -> float:
        return self.print_envelope.x.max_mm

    @property
    def min_y_mm(self) -> float:
        return self.print_envelope.y.min_mm

    @property
    def max_y_mm(self) -> float:
        return self.print_envelope.y.max_mm

    @property
    def min_z_mm(self) -> float:
        return self.print_envelope.z.min_mm

    @property
    def max_z_mm(self) -> float:
        return self.print_envelope.z.max_mm

    def as_payload(self) -> dict[str, Any]:
        return {
            "bed_size_x_mm": self.size_x_mm,
            "bed_size_y_mm": self.size_y_mm,
            "bed_height_z_mm": self.height_z_mm,
            "min_x_mm": self.min_x_mm,
            "max_x_mm": self.max_x_mm,
            "min_y_mm": self.min_y_mm,
            "max_y_mm": self.max_y_mm,
            "min_z_mm": self.min_z_mm,
            "max_z_mm": self.max_z_mm,
            "print_envelope": self.print_envelope.as_payload(),
            "move_envelope": self.move_envelope.as_payload(),
            "printable_area": [
                {"x": self.min_x_mm, "y": self.min_y_mm},
                {"x": self.max_x_mm, "y": self.min_y_mm},
                {"x": self.max_x_mm, "y": self.max_y_mm},
                {"x": self.min_x_mm, "y": self.max_y_mm},
            ],
            "kinematics": self.kinematics,
            "source": self.source,
        }


class BedVolumeSyncError(RuntimeError):
    """Raised when the bed volume cannot be derived from Moonraker."""


def query_printer_bed_volume(base_url: str, timeout: int = 10) -> BedVolume:
    geometry = query_printer_objects(
        base_url,
        {MYCO_GEOMETRY_OBJECT: None, CONFIGFILE_OBJECT: ["settings"]},
        timeout=timeout,
    )
    if geometry.get("ok"):
        volume = _extract_from_myco_geometry(geometry.get("data"))
        if volume is not None:
            return volume

    fallback = query_printer_objects(
        base_url,
        {
            TOOLHEAD_OBJECT: ["axis_minimum", "axis_maximum"],
            CONFIGFILE_OBJECT: ["settings"],
        },
        timeout=timeout,
    )
    if not fallback.get("ok"):
        geometry_error = geometry.get("error") if not geometry.get("ok") else None
        error = fallback.get("error") or geometry_error or "Moonraker query failed."
        raise BedVolumeSyncError(f"Moonraker bed-volume query failed: {error}")

    volume = extract_bed_volume_from_query_payload(fallback.get("data"))
    if volume is None:
        raise BedVolumeSyncError("Could not derive bed volume from configfile.")
    return volume


def extract_bed_volume_from_query_payload(payload: Any) -> BedVolume:
    """Best-effort extraction across both payload shapes; tests use it directly."""
    volume = _extract_from_myco_geometry(payload)
    if volume is not None:
        return volume
    volume = _extract_from_toolhead(payload)
    if volume is not None:
        return volume
    volume = _extract_from_configfile(payload)
    if volume is None:
        raise BedVolumeSyncError("Moonraker payload contains no bed-volume data.")
    return volume


def _extract_from_myco_geometry(payload: Any) -> BedVolume | None:
    status = _status_dict(payload)
    if not status:
        return None
    macro = status.get(MYCO_GEOMETRY_OBJECT)
    if not isinstance(macro, dict):
        return None

    move = _macro_envelope(macro, "nozzle")
    printable = _macro_envelope(macro, "print")
    if move is None or printable is None:
        return None
    if not _envelope_inside(printable, move):
        raise BedVolumeSyncError("Mycoforge print envelope is outside the movement envelope.")

    return _volume_from_envelopes(
        print_envelope=printable,
        move_envelope=move,
        kinematics=_kinematics_from_status(status),
        source="myco_geometry",
    )


def _extract_from_toolhead(payload: Any) -> BedVolume | None:
    status = _status_dict(payload)
    if not status:
        return None
    toolhead = status.get(TOOLHEAD_OBJECT)
    if not isinstance(toolhead, dict):
        return None

    axis_min = toolhead.get("axis_minimum")
    axis_max = toolhead.get("axis_maximum")
    if not _is_xyz_triple(axis_min) or not _is_xyz_triple(axis_max):
        return None

    envelope = _envelope_from_axis_lists(axis_min, axis_max)
    if envelope is None:
        return None

    return _volume_from_envelopes(
        print_envelope=envelope,
        move_envelope=envelope,
        kinematics=_kinematics_from_status(status),
        source="toolhead",
    )


def _extract_from_configfile(payload: Any) -> BedVolume | None:
    status = _status_dict(payload)
    if not status:
        return None
    config = status.get(CONFIGFILE_OBJECT)
    if not isinstance(config, dict):
        return None
    settings = config.get("settings")
    if not isinstance(settings, dict):
        return None

    envelope = _envelope_from_steppers(settings)
    if envelope is None:
        return None

    return _volume_from_envelopes(
        print_envelope=envelope,
        move_envelope=envelope,
        kinematics=_kinematics_from_status(status),
        source="configfile",
    )


def _macro_envelope(macro: dict[str, Any], prefix: str) -> GeometryEnvelope | None:
    x_min = _macro_float(macro, f"{prefix}_x_min")
    x_max = _macro_float(macro, f"{prefix}_x_max")
    y_min = _macro_float(macro, f"{prefix}_y_min")
    y_max = _macro_float(macro, f"{prefix}_y_max")
    z_min = _macro_float(macro, f"{prefix}_z_min")
    z_max = _macro_float(macro, f"{prefix}_z_max")
    return _envelope_from_min_max(x_min, x_max, y_min, y_max, z_min, z_max)


def _macro_float(macro: dict[str, Any], name: str) -> float | None:
    return _coerce_float(macro.get(name, macro.get(f"variable_{name}")))


def _envelope_from_axis_lists(axis_min: Any, axis_max: Any) -> GeometryEnvelope | None:
    if not _is_xyz_triple(axis_min) or not _is_xyz_triple(axis_max):
        return None
    return _envelope_from_min_max(
        _coerce_float(axis_min[0]),
        _coerce_float(axis_max[0]),
        _coerce_float(axis_min[1]),
        _coerce_float(axis_max[1]),
        _coerce_float(axis_min[2]),
        _coerce_float(axis_max[2]),
    )


def _envelope_from_steppers(settings: dict[str, Any]) -> GeometryEnvelope | None:
    x = _stepper_envelope(settings.get("stepper_x"))
    y = _stepper_envelope(settings.get("stepper_y"))
    z = _stepper_envelope(settings.get("stepper_z"))
    if x is None or y is None or z is None:
        return None
    return GeometryEnvelope(x=x, y=y, z=z)


def _stepper_envelope(stepper: Any) -> AxisEnvelope | None:
    if not isinstance(stepper, dict):
        return None
    minimum = _coerce_float(stepper.get("position_min"))
    maximum = _coerce_float(stepper.get("position_max"))
    if minimum is None:
        # Klipper omits position_min from stepper_x/y when it defaults to 0.
        minimum = 0.0
    if maximum is None:
        maximum = _coerce_float(stepper.get("position_endstop"))
    if maximum is None:
        return None
    return _axis_envelope(minimum, maximum)


def _envelope_from_min_max(
    x_min: float | None,
    x_max: float | None,
    y_min: float | None,
    y_max: float | None,
    z_min: float | None,
    z_max: float | None,
) -> GeometryEnvelope | None:
    x = _axis_envelope(x_min, x_max)
    y = _axis_envelope(y_min, y_max)
    z = _axis_envelope(z_min, z_max)
    if x is None or y is None or z is None:
        return None
    return GeometryEnvelope(x=x, y=y, z=z)


def _axis_envelope(minimum: float | None, maximum: float | None) -> AxisEnvelope | None:
    if minimum is None or maximum is None:
        return None
    minimum = _round_float(minimum)
    maximum = _round_float(maximum)
    if _positive(maximum - minimum) is None:
        return None
    return AxisEnvelope(min_mm=minimum, max_mm=maximum)


def _volume_from_envelopes(
    *,
    print_envelope: GeometryEnvelope,
    move_envelope: GeometryEnvelope,
    kinematics: str,
    source: str,
) -> BedVolume:
    return BedVolume(
        size_x_mm=print_envelope.size_x_mm,
        size_y_mm=print_envelope.size_y_mm,
        height_z_mm=print_envelope.height_z_mm,
        kinematics=kinematics,
        source=source,
        print_envelope=print_envelope,
        move_envelope=move_envelope,
    )


def _envelope_inside(inner: GeometryEnvelope, outer: GeometryEnvelope) -> bool:
    return (
        inner.x.min_mm >= outer.x.min_mm
        and inner.x.max_mm <= outer.x.max_mm
        and inner.y.min_mm >= outer.y.min_mm
        and inner.y.max_mm <= outer.y.max_mm
        and inner.z.min_mm >= outer.z.min_mm
        and inner.z.max_mm <= outer.z.max_mm
    )


def _kinematics_from_status(status: dict[str, Any]) -> str:
    config_status = status.get(CONFIGFILE_OBJECT)
    if isinstance(config_status, dict):
        settings = config_status.get("settings")
        if isinstance(settings, dict):
            printer = settings.get("printer")
            if isinstance(printer, dict):
                return str(printer.get("kinematics") or "")
    return ""


def _status_dict(payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    result = payload.get("result")
    if not isinstance(result, dict):
        return None
    status = result.get("status")
    if not isinstance(status, dict):
        return None
    return status


def _is_xyz_triple(value: Any) -> bool:
    if not isinstance(value, (list, tuple)) or len(value) < 3:
        return False
    return all(_coerce_float(component) is not None for component in value[:3])


def _coerce_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _positive(value: float) -> float | None:
    if value is None:
        return None
    if value <= 0 or value != value:  # NaN check
        return None
    return round(float(value), 3)


def _round_float(value: float) -> float:
    return round(float(value), 3)
