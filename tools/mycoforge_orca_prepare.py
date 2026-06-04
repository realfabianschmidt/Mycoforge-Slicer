"""Prepare a nozzle-aware OrcaSlicer run for Mycoforge."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from mycoforge_cli.nozzle_sync import (
    NozzleSyncError,
    load_nozzle_profiles,
    profile_for_nozzle,
    query_printer_nozzle,
)
from mycoforge_cli.slicer_runner import ORCA_DIALECT, SliceRequest, build_slicer_command, slice_model


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--moonraker-url", required=True)
    parser.add_argument("--orcaslicer-path")
    parser.add_argument("--profiles-dir", required=True)
    parser.add_argument("--mode", choices=["print", "export", "info"], default="info")
    parser.add_argument("--input")
    parser.add_argument("--output")
    args = parser.parse_args(argv)

    try:
        nozzle = query_printer_nozzle(args.moonraker_url)
        profile_map = load_nozzle_profiles(Path(args.profiles_dir) / "nozzle_profiles.json")
        profile = profile_for_nozzle(nozzle, profile_map)
    except (OSError, NozzleSyncError) as exc:
        print(str(exc), file=sys.stderr)
        return 1

    payload = {
        "nozzle_diameter": nozzle,
        "profile_name": profile.profile_name,
        "line_width_mm": profile.line_width_mm,
        "layer_height_mm": profile.layer_height_mm,
    }

    if args.mode == "info":
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0

    if not args.orcaslicer_path or not args.input or not args.output:
        print("--mode export|print requires --orcaslicer-path, --input, and --output.", file=sys.stderr)
        return 1

    request = SliceRequest(
        model_path=Path(args.input),
        output_path=Path(args.output),
        slicer_binary=Path(args.orcaslicer_path),
        nozzle_diameter_mm=nozzle,
        line_width_mm=profile.line_width_mm,
        layer_height_mm=profile.layer_height_mm,
        print_speed_mm_s=profile.print_speed_mm_s,
    )

    if args.mode == "print":
        command = build_slicer_command(request, dialect=ORCA_DIALECT)
        print(json.dumps({**payload, "command": command}, indent=2, sort_keys=True))
        return 0

    result = slice_model(request)
    print(json.dumps({**payload, "slice": result}, indent=2, sort_keys=True))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
