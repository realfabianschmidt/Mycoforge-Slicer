"""Validate Mycoforge G-code nozzle metadata against the printer state."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from mycoforge_cli.nozzle_sync import (
    NozzleSyncError,
    ensure_start_print_nozzle,
    query_printer_nozzle,
    validate_gcode_nozzle,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--moonraker-url", required=True)
    parser.add_argument("--json", action="store_true", dest="as_json")
    parser.add_argument("gcode_path")
    args = parser.parse_args(argv)

    path = Path(args.gcode_path)
    if not path.is_file():
        print(f"G-code file does not exist: {path}", file=sys.stderr)
        return 1

    lines = path.read_text(encoding="utf-8").splitlines()
    try:
        ensure_start_print_nozzle(lines)
        printer_nozzle = query_printer_nozzle(args.moonraker_url)
        slicer_nozzle = validate_gcode_nozzle(lines, printer_nozzle)
    except NozzleSyncError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    payload = {"ok": True, "printer_nozzle": printer_nozzle, "slicer_nozzle": slicer_nozzle}
    print(json.dumps(payload, sort_keys=True) if args.as_json else "Nozzle validation OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
