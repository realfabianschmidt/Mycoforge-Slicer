"""Normalize print feedrates while preserving travel and retraction semantics."""

from __future__ import annotations

import re

from .gcode_parser import ParsedLine


FEEDRATE_RE = re.compile(r"(?i)(^|\s)F[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?")


def normalize_feedrates(parsed_lines: list[ParsedLine], target_print_speed_mm_s: float) -> list[str]:
    feedrate = target_print_speed_mm_s * 60.0
    output = [
        "; processed_by = Mycoforge Flow Normalizer",
        f"; target_print_speed_mm_s = {format_number(target_print_speed_mm_s)}",
    ]

    for parsed in parsed_lines:
        if parsed.line_type == "extrude_move":
            output.append(set_feedrate(parsed.original, feedrate))
        else:
            output.append(parsed.original)
    return output


def set_feedrate(line: str, feedrate: float) -> str:
    code, comment = _split_comment_keep_spacing(line)
    formatted = f"F{format_number(feedrate)}"

    if FEEDRATE_RE.search(code):
        code = FEEDRATE_RE.sub(lambda match: f"{match.group(1)}{formatted}", code, count=1)
    else:
        code = f"{code.rstrip()} {formatted}".rstrip()

    if comment:
        separator = "" if code.endswith(" ") or comment.startswith(" ") else " "
        return f"{code}{separator}{comment}"
    return code


def format_number(value: float) -> str:
    if float(value).is_integer():
        return str(int(value))
    return f"{value:.6f}".rstrip("0").rstrip(".")


def _split_comment_keep_spacing(line: str) -> tuple[str, str]:
    if ";" not in line:
        return line, ""
    index = line.index(";")
    return line[:index].rstrip(), line[index:]
