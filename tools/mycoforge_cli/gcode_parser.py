"""Stateful G-code parser for the Mycoforge MVP pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Iterable


PARAM_RE = re.compile(r"([A-Za-z])([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)")
EPSILON = 1e-9


@dataclass(frozen=True)
class ParsedLine:
    original: str
    code: str
    comment: str
    command: str | None
    params: dict[str, float] = field(default_factory=dict)
    line_type: str = "other"
    extrusion_mode: str = "absolute"
    extrusion_delta: float | None = None
    amount: float | None = None
    speed: float | None = None

    @property
    def has_xy(self) -> bool:
        return "X" in self.params or "Y" in self.params


def split_comment(line: str) -> tuple[str, str]:
    if ";" not in line:
        return line.rstrip("\n"), ""
    code, comment = line.rstrip("\n").split(";", 1)
    return code.rstrip(), ";" + comment


def parse_params(code: str) -> tuple[str | None, dict[str, float]]:
    tokens = PARAM_RE.findall(code)
    if not tokens:
        return None, {}

    command = None
    params: dict[str, float] = {}
    for letter, value in tokens:
        upper = letter.upper()
        if command is None and upper in {"G", "M", "T"}:
            command = f"{upper}{int(float(value))}"
            continue
        params[upper] = float(value)
    return command, params


def parse_lines(lines: Iterable[str] | str) -> list[ParsedLine]:
    if isinstance(lines, str):
        source_lines = lines.splitlines()
    else:
        source_lines = [line.rstrip("\n") for line in lines]

    state = _ParserState()
    return [state.parse_line(line) for line in source_lines]


class _ParserState:
    def __init__(self) -> None:
        self.extrusion_mode = "absolute"
        self.absolute_e = 0.0
        self.retracted = False

    def parse_line(self, line: str) -> ParsedLine:
        stripped = line.strip()
        code, comment = split_comment(line)

        if not stripped:
            return ParsedLine(line, code, comment, None, {}, "comment", self.extrusion_mode)

        if stripped.startswith(";"):
            line_type = "layer_change" if stripped.upper().startswith(";LAYER:") else "comment"
            return ParsedLine(line, code, comment or stripped, None, {}, line_type, self.extrusion_mode)

        command, params = parse_params(code)
        speed = params.get("F")

        if command == "M82":
            self.extrusion_mode = "absolute"
            return ParsedLine(line, code, comment, command, params, "command", self.extrusion_mode, speed=speed)

        if command == "M83":
            self.extrusion_mode = "relative"
            return ParsedLine(line, code, comment, command, params, "command", self.extrusion_mode, speed=speed)

        if command == "G92" and "E" in params:
            self.absolute_e = params["E"]
            self.retracted = False
            return ParsedLine(line, code, comment, command, params, "command", self.extrusion_mode, speed=speed)

        if command not in {"G0", "G1"}:
            line_type = "command" if command else "other"
            return ParsedLine(line, code, comment, command, params, line_type, self.extrusion_mode, speed=speed)

        line_type, delta, amount = self._classify_movement(params)

        return ParsedLine(
            original=line,
            code=code,
            comment=comment,
            command=command,
            params=params,
            line_type=line_type,
            extrusion_mode=self.extrusion_mode,
            extrusion_delta=delta,
            amount=amount,
            speed=speed,
        )

    def _classify_movement(self, params: dict[str, float]) -> tuple[str, float | None, float | None]:
        has_x = "X" in params
        has_y = "Y" in params
        has_xy = has_x or has_y
        has_z = "Z" in params
        has_e = "E" in params

        if not has_e:
            if has_z and not has_xy:
                return "layer_change", None, None
            if has_xy:
                return "travel_move", None, None
            return "command", None, None

        e_value = params["E"]
        if self.extrusion_mode == "relative":
            delta = e_value
        else:
            delta = e_value - self.absolute_e
            self.absolute_e = e_value

        if delta < -EPSILON:
            self.retracted = True
            return "retract", delta, abs(delta)

        if delta > EPSILON and has_xy:
            return "extrude_move", delta, delta

        if delta > EPSILON and not has_xy:
            if self.extrusion_mode == "relative" or self.retracted:
                self.retracted = False
                return "prime", delta, delta
            return "command", delta, delta

        if has_xy:
            return "travel_move", delta, None
        if has_z:
            return "layer_change", delta, None
        return "command", delta, None
