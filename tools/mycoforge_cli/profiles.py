"""Profile loading helpers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def load_profile(path: str | Path) -> dict[str, Any]:
    profile_path = Path(path)
    with profile_path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"Profile must contain a JSON object: {profile_path}")
    return data


def material_defaults(profile: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": profile.get("id", "unknown"),
        "name": profile.get("name", "Unknown"),
        "line_width_mm": float(profile.get("line_width_mm", 0.0)),
        "layer_height_mm": float(profile.get("layer_height_mm", 0.0)),
        "print_speed_mm_s": float(profile.get("print_speed_mm_s", 15.0)),
        "travel_speed_mm_s": float(profile.get("travel_speed_mm_s", 80.0)),
        "retraction": profile.get("retraction", {}),
        "motion": profile.get("motion", {}),
        "flow": profile.get("flow", {}),
        "paste": profile.get("paste", {}),
        "klipper": profile.get("klipper", {}),
        "calibration": profile.get("calibration", {}),
    }
