"""Paste-oriented filtering for tiny extrusion segments."""

from __future__ import annotations

from dataclasses import dataclass
from math import hypot
from re import Match
from typing import Iterable

from .gcode_parser import EPSILON, PARAM_RE, parse_params, split_comment


@dataclass(frozen=True)
class ShortExtrusionStats:
    enabled: bool
    min_extrusion_path_mm: float
    skipped_short_extrusions: int = 0
    skipped_short_extrusion_e: float = 0.0

    def as_dict(self) -> dict[str, float | int | bool]:
        return {
            "enabled": self.enabled,
            "min_extrusion_path_mm": self.min_extrusion_path_mm,
            "skipped_short_extrusions": self.skipped_short_extrusions,
            "skipped_short_extrusion_e": self.skipped_short_extrusion_e,
        }


def default_min_extrusion_path_mm(line_width_mm: float | None) -> float:
    if line_width_mm is None or line_width_mm <= 0:
        return 5.0
    return max(5.0, line_width_mm * 1.5)


def filter_short_extrusions(
    lines: Iterable[str],
    *,
    min_path_mm: float,
) -> tuple[list[str], ShortExtrusionStats]:
    state = _FilterState(min_path_mm)
    return state.filter(lines)


def short_extrusion_filter_header(stats: ShortExtrusionStats) -> list[str]:
    return [
        f"; short_extrusion_filter = {'on' if stats.enabled else 'off'}",
        f"; min_extrusion_path_mm = {_format_float(stats.min_extrusion_path_mm)}",
        f"; skipped_short_extrusions = {stats.skipped_short_extrusions}",
        f"; skipped_short_extrusion_e = {_format_float(stats.skipped_short_extrusion_e)}",
    ]


class _FilterState:
    def __init__(self, min_path_mm: float) -> None:
        self.min_path_mm = min_path_mm
        self.coordinate_mode = "absolute"
        self.extrusion_mode = "absolute"
        self.x = 0.0
        self.y = 0.0
        self.absolute_e = 0.0
        self.skipped_absolute_e = 0.0
        self.skipped_count = 0
        self.skipped_e = 0.0

    def filter(self, lines: Iterable[str]) -> tuple[list[str], ShortExtrusionStats]:
        output: list[str] = []
        for raw_line in lines:
            output.append(self._filter_line(raw_line.rstrip("\n")))

        stats = ShortExtrusionStats(
            enabled=True,
            min_extrusion_path_mm=self.min_path_mm,
            skipped_short_extrusions=self.skipped_count,
            skipped_short_extrusion_e=round(self.skipped_e, 6),
        )
        return output, stats

    def _filter_line(self, line: str) -> str:
        code, _comment = split_comment(line)
        command, params = parse_params(code)
        if command is None:
            return line

        if command == "G90":
            self.coordinate_mode = "absolute"
            return line
        if command == "G91":
            self.coordinate_mode = "relative"
            return line
        if command == "M82":
            self.extrusion_mode = "absolute"
            return line
        if command == "M83":
            self.extrusion_mode = "relative"
            return line

        if command == "G92":
            if "E" in params:
                self.absolute_e = params["E"]
                self.skipped_absolute_e = 0.0
            if "X" in params:
                self.x = params["X"]
            if "Y" in params:
                self.y = params["Y"]
            return line

        if command == "G28":
            if not params or "X" in params:
                self.x = 0.0
            if not params or "Y" in params:
                self.y = 0.0
            return line

        if command not in {"G0", "G1", "G2", "G3"}:
            return line

        next_x, next_y = self._next_xy(params)
        xy_distance = hypot(next_x - self.x, next_y - self.y)
        has_xy = "X" in params or "Y" in params
        has_e = "E" in params
        e_delta = self._e_delta(params) if has_e else None

        if command in {"G0", "G1"} and has_xy and e_delta is not None and e_delta > EPSILON:
            if xy_distance < self.min_path_mm:
                self.x = next_x
                self.y = next_y
                self._accept_e(params)
                self._skip_e_delta(e_delta)
                return _append_skip_comment(_remove_param(line, "E"), xy_distance, e_delta)

        rewritten = line
        if has_e and self.extrusion_mode == "absolute" and abs(self.skipped_absolute_e) > EPSILON:
            rewritten = _replace_param(line, "E", params["E"] - self.skipped_absolute_e)

        self.x = next_x
        self.y = next_y
        if has_e:
            self._accept_e(params)
        return rewritten

    def _next_xy(self, params: dict[str, float]) -> tuple[float, float]:
        if self.coordinate_mode == "relative":
            return self.x + params.get("X", 0.0), self.y + params.get("Y", 0.0)
        return params.get("X", self.x), params.get("Y", self.y)

    def _e_delta(self, params: dict[str, float]) -> float:
        e_value = params["E"]
        if self.extrusion_mode == "relative":
            return e_value
        return e_value - self.absolute_e

    def _accept_e(self, params: dict[str, float]) -> None:
        if self.extrusion_mode == "absolute":
            self.absolute_e = params["E"]

    def _skip_e_delta(self, e_delta: float) -> None:
        if self.extrusion_mode == "absolute":
            self.skipped_absolute_e += e_delta
        self.skipped_count += 1
        self.skipped_e += e_delta


def _remove_param(line: str, letter: str) -> str:
    code, comment = split_comment(line)
    pieces: list[str] = []
    cursor = 0
    for match in PARAM_RE.finditer(code):
        if match.group(1).upper() != letter:
            continue
        pieces.append(code[cursor : match.start()].rstrip())
        cursor = match.end()
    pieces.append(code[cursor:])
    next_code = " ".join("".join(pieces).split())
    return _join_code_comment(next_code, comment)


def _replace_param(line: str, letter: str, value: float) -> str:
    code, comment = split_comment(line)

    def replace(match: Match[str]) -> str:
        if match.group(1).upper() != letter:
            return match.group(0)
        return f"{match.group(1)}{_format_float(value)}"

    next_code = PARAM_RE.sub(replace, code)
    return _join_code_comment(next_code, comment)


def _append_skip_comment(line: str, length_mm: float, e_delta: float) -> str:
    suffix = (
        "MYCO_SKIPPED_SHORT_EXTRUSION "
        f"length_mm={_format_float(length_mm)} e_delta={_format_float(e_delta)}"
    )
    if ";" in line:
        return f"{line} ;{suffix}"
    return f"{line} ;{suffix}"


def _join_code_comment(code: str, comment: str) -> str:
    if comment:
        return f"{code} {comment}".rstrip() if code else comment
    return code.rstrip()


def _format_float(value: float) -> str:
    return f"{value:.6f}".rstrip("0").rstrip(".")
