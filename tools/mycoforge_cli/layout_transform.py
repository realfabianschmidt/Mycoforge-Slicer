"""Apply final Mycoforge plater placement to sliced G-code."""

from __future__ import annotations

from dataclasses import dataclass
import json
import math
import re
from typing import Any, Iterable

from .flow_normalizer import format_number
from .gcode_parser import parse_params


AXIS_TOKEN_RE = re.compile(
    r"(?i)([XYZ])([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)"
)
EPSILON = 1e-9


class LayoutTransformError(ValueError):
    """Raised when a post-slice layout transform cannot be applied safely."""


@dataclass(frozen=True)
class LayoutTransform:
    translate_x_mm: float = 0.0
    translate_y_mm: float = 0.0
    translate_z_mm: float = 0.0

    @property
    def has_offset(self) -> bool:
        return any(
            abs(value) > EPSILON
            for value in (self.translate_x_mm, self.translate_y_mm, self.translate_z_mm)
        )

    def offset_for_axis(self, axis: str) -> float:
        if axis == "X":
            return self.translate_x_mm
        if axis == "Y":
            return self.translate_y_mm
        if axis == "Z":
            return self.translate_z_mm
        return 0.0


def layout_transform_from_json(raw: str | None) -> LayoutTransform | None:
    if raw is None or not raw.strip():
        return None
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise LayoutTransformError(f"Invalid layout transform JSON: {exc.msg}") from exc
    if not isinstance(payload, dict):
        raise LayoutTransformError("Layout transform JSON must be an object.")
    return LayoutTransform(
        translate_x_mm=_read_number(payload, "translateXMm"),
        translate_y_mm=_read_number(payload, "translateYMm"),
        translate_z_mm=_read_number(payload, "translateZMm"),
    )


def layout_transform_header(transform: LayoutTransform | None) -> list[str]:
    if transform is None:
        return []
    return [
        "; mycoforge_layout_transform = post_slice_offset",
        f"; layout_offset_x_mm = {format_number(transform.translate_x_mm)}",
        f"; layout_offset_y_mm = {format_number(transform.translate_y_mm)}",
        f"; layout_offset_z_mm = {format_number(transform.translate_z_mm)}",
    ]


def apply_layout_transform(
    lines: Iterable[str],
    transform: LayoutTransform | None,
) -> list[str]:
    source_lines = [line.rstrip("\n") for line in lines]
    if transform is None or not transform.has_offset:
        return source_lines

    output: list[str] = []
    absolute_xyz = True

    for line_number, line in enumerate(source_lines, start=1):
        code, comment = _split_comment_keep_spacing(line)
        command, params = parse_params(code)

        if command == "G90":
            absolute_xyz = True
            output.append(line)
            continue
        if command == "G91":
            absolute_xyz = False
            output.append(line)
            continue
        if command not in {"G0", "G1"}:
            output.append(line)
            continue

        present_axes = [axis for axis in ("X", "Y", "Z") if axis in params]
        if not present_axes:
            output.append(line)
            continue

        if not absolute_xyz:
            unsafe_axes = [
                axis for axis in present_axes if abs(transform.offset_for_axis(axis)) > EPSILON
            ]
            if unsafe_axes:
                axes = ",".join(unsafe_axes)
                raise LayoutTransformError(
                    f"Cannot apply layout offset to relative {axes} move on line {line_number}: {line}"
                )
            output.append(line)
            continue

        updates = {
            axis: params[axis] + transform.offset_for_axis(axis)
            for axis in present_axes
            if abs(transform.offset_for_axis(axis)) > EPSILON
        }
        if not updates:
            output.append(line)
            continue
        output.append(_rewrite_axis_params(code, updates) + comment)

    return output


def _read_number(payload: dict[str, Any], key: str) -> float:
    value = payload.get(key, 0.0)
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise LayoutTransformError(f"Layout transform field {key} must be a number.") from exc
    if not math.isfinite(number):
        raise LayoutTransformError(f"Layout transform field {key} must be finite.")
    return number


def _split_comment_keep_spacing(line: str) -> tuple[str, str]:
    if ";" not in line:
        return line, ""
    index = line.index(";")
    return line[:index], line[index:]


def _rewrite_axis_params(code: str, updates: dict[str, float]) -> str:
    replaced: set[str] = set()

    def replace(match: re.Match[str]) -> str:
        axis = match.group(1).upper()
        if axis not in updates or axis in replaced:
            return match.group(0)
        replaced.add(axis)
        return f"{match.group(1)}{format_number(updates[axis])}"

    return AXIS_TOKEN_RE.sub(replace, code)
