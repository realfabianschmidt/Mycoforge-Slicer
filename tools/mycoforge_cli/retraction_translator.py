"""Translate slicer retraction into Mycoforge annotations or Klipper macros."""

from __future__ import annotations

from .flow_normalizer import format_number
from .gcode_parser import ParsedLine


VALID_MODES = {"annotate_only", "macro_translate"}


def translate_retractions(
    parsed_lines: list[ParsedLine],
    translation_mode: str = "annotate_only",
    macro_mode: str = "pcp_pressure_relief",
) -> list[str]:
    if translation_mode not in VALID_MODES:
        raise ValueError(f"Unsupported retraction translation mode: {translation_mode}")

    output: list[str] = []
    for parsed in parsed_lines:
        if parsed.line_type == "retract":
            output.extend(_translate_retract(parsed, translation_mode, macro_mode))
            continue

        if parsed.line_type == "prime":
            output.extend(_translate_prime(parsed, translation_mode))
            continue

        output.append(parsed.original)
    return output


def _translate_retract(parsed: ParsedLine, translation_mode: str, macro_mode: str) -> list[str]:
    amount = format_number(parsed.amount or 0.0)
    speed = format_number(parsed.speed or 0.0)

    if translation_mode == "annotate_only":
        return [f";MYCO_EVENT RETRACT AMOUNT={amount} SPEED={speed}", parsed.original]

    return [f"MYCO_RETRACT AMOUNT={amount} SPEED={speed} MODE={macro_mode}"]


def _translate_prime(parsed: ParsedLine, translation_mode: str) -> list[str]:
    amount = format_number(parsed.amount or 0.0)
    speed = format_number(parsed.speed or 0.0)

    if translation_mode == "annotate_only":
        return [f";MYCO_EVENT PRIME AMOUNT={amount} SPEED={speed}", parsed.original]

    return [f"MYCO_PRIME AMOUNT={amount} SPEED={speed} MODE=controlled"]
