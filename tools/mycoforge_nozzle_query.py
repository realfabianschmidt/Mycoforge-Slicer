"""Query the Mycoforge nozzle diameter from Moonraker."""

from __future__ import annotations

import argparse
import json
import sys

from mycoforge_cli.nozzle_sync import NozzleSyncError, query_printer_nozzle


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--moonraker-url", default="http://mycoforge.local")
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args(argv)

    try:
        nozzle = query_printer_nozzle(args.moonraker_url)
    except NozzleSyncError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    if args.as_json:
        print(json.dumps({"nozzle_diameter": nozzle}, sort_keys=True))
    else:
        print(f"{nozzle:g}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
