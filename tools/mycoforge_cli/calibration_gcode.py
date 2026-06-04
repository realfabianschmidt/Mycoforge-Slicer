"""Built-in paste calibration G-code generators."""

from __future__ import annotations

from typing import Any

from .paste_contract import build_mycoforge_footer, build_mycoforge_header, paste_metrics, format_number


VALID_CALIBRATION_PATTERNS = {
    "line_width",
    "flow_ladder",
    "corner_pressure",
    "prime_retract",
    "layer_adhesion",
}


def generate_calibration_gcode(pattern: str, material: dict[str, Any]) -> list[str]:
    if pattern not in VALID_CALIBRATION_PATTERNS:
        supported = ", ".join(sorted(VALID_CALIBRATION_PATTERNS))
        raise ValueError(f"Unsupported calibration pattern '{pattern}'. Supported: {supported}")

    body = {
        "line_width": _line_width_pattern,
        "flow_ladder": _flow_ladder_pattern,
        "corner_pressure": _corner_pressure_pattern,
        "prime_retract": _prime_retract_pattern,
        "layer_adhesion": _layer_adhesion_pattern,
    }[pattern](material)

    return build_mycoforge_header(material) + body + build_mycoforge_footer(material)


def _line_width_pattern(material: dict[str, Any]) -> list[str]:
    metrics = paste_metrics(material)
    lines = _preamble("line_width")
    y = 30.0
    for index, factor in enumerate([0.8, 0.9, 1.0, 1.1, 1.2], start=1):
        length = 160.0
        e = _relative_e(length, metrics.line_width_mm * factor, metrics.layer_height_mm, metrics.virtual_e_area_mm2)
        lines.extend(
            [
                f"; line_width_factor = {format_number(factor)}",
                f"G0 X30 Y{format_number(y)} Z{format_number(metrics.layer_height_mm)} F4800",
                f"G1 X190 Y{format_number(y)} E{format_number(e)} F{format_number(metrics.print_speed_mm_s * 60)}",
            ]
        )
        y += metrics.line_width_mm * 3
    return lines


def _flow_ladder_pattern(material: dict[str, Any]) -> list[str]:
    metrics = paste_metrics(material)
    lines = _preamble("flow_ladder")
    x = 30.0
    for factor in [0.6, 0.8, 1.0, 1.2, 1.4]:
        speed = metrics.print_speed_mm_s * factor
        e = _relative_e(80, metrics.line_width_mm, metrics.layer_height_mm, metrics.virtual_e_area_mm2)
        lines.extend(
            [
                f"; speed_factor = {format_number(factor)}",
                f"G0 X{format_number(x)} Y40 Z{format_number(metrics.layer_height_mm)} F4800",
                f"G1 X{format_number(x)} Y120 E{format_number(e)} F{format_number(speed * 60)}",
            ]
        )
        x += metrics.line_width_mm * 4
    return lines


def _corner_pressure_pattern(material: dict[str, Any]) -> list[str]:
    metrics = paste_metrics(material)
    lines = _preamble("corner_pressure")
    z = metrics.layer_height_mm
    size = 70.0
    for layer in range(3):
        lines.append(f"; corner_pressure_layer = {layer + 1}")
        lines.append(f"G0 X60 Y60 Z{format_number(z)} F4800")
        for x, y in [(130, 60), (130, 130), (60, 130), (60, 60)]:
            e = _relative_e(size, metrics.line_width_mm, metrics.layer_height_mm, metrics.virtual_e_area_mm2)
            lines.append(
                f"G1 X{format_number(x)} Y{format_number(y)} E{format_number(e)} F{format_number(metrics.print_speed_mm_s * 60)}"
            )
        z += metrics.layer_height_mm
    return lines


def _prime_retract_pattern(material: dict[str, Any]) -> list[str]:
    metrics = paste_metrics(material)
    retraction = material.get("retraction", {})
    amount = retraction.get("amount_mm", 1.0) if isinstance(retraction, dict) else 1.0
    prime = retraction.get("prime_amount_mm", amount) if isinstance(retraction, dict) else amount
    speed = retraction.get("speed_mm_s", 8.0) if isinstance(retraction, dict) else 8.0
    lines = _preamble("prime_retract")
    for index, y in enumerate([40, 60, 80, 100, 120], start=1):
        e = _relative_e(60, metrics.line_width_mm, metrics.layer_height_mm, metrics.virtual_e_area_mm2)
        lines.extend(
            [
                f"; prime_retract_cycle = {index}",
                f"G0 X50 Y{format_number(y)} Z{format_number(metrics.layer_height_mm)} F4800",
                f"G1 X110 Y{format_number(y)} E{format_number(e)} F{format_number(metrics.print_speed_mm_s * 60)}",
                f"G1 E-{format_number(amount)} F{format_number(float(speed) * 60)}",
                "G0 X130 F4800",
                f"G1 E{format_number(prime)} F{format_number(float(speed) * 60)}",
            ]
        )
    return lines


def _layer_adhesion_pattern(material: dict[str, Any]) -> list[str]:
    metrics = paste_metrics(material)
    lines = _preamble("layer_adhesion")
    z = metrics.layer_height_mm
    for layer in range(6):
        inset = layer * metrics.line_width_mm * 0.35
        x0 = 70 + inset
        y0 = 70 + inset
        x1 = 150 - inset
        y1 = 150 - inset
        lines.append(f"; layer_adhesion_layer = {layer + 1}")
        lines.append(f"G0 X{format_number(x0)} Y{format_number(y0)} Z{format_number(z)} F4800")
        for x, y, length in [(x1, y0, x1 - x0), (x1, y1, y1 - y0), (x0, y1, x1 - x0), (x0, y0, y1 - y0)]:
            e = _relative_e(length, metrics.line_width_mm, metrics.layer_height_mm, metrics.virtual_e_area_mm2)
            lines.append(
                f"G1 X{format_number(x)} Y{format_number(y)} E{format_number(e)} F{format_number(metrics.print_speed_mm_s * 60)}"
            )
        z += metrics.layer_height_mm
    return lines


def _preamble(pattern: str) -> list[str]:
    return [
        f"; calibration_pattern = {pattern}",
        "G90",
        "M83",
        "G92 E0",
    ]


def _relative_e(
    length_mm: float,
    line_width_mm: float,
    layer_height_mm: float,
    virtual_e_area_mm2: float,
) -> float:
    if virtual_e_area_mm2 <= 0:
        return 0.0
    return length_mm * line_width_mm * layer_height_mm / virtual_e_area_mm2
