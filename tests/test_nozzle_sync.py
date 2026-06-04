import json

import pytest

from mycoforge_cli.nozzle_sync import (
    NozzleSyncError,
    ensure_start_print_nozzle,
    extract_nozzle_from_query_payload,
    load_nozzle_profiles,
    parse_gcode_slicer_nozzle,
    profile_for_nozzle,
    validate_gcode_nozzle,
)


def test_query_payload_extracts_macro_nozzle():
    payload = {
        "result": {
            "status": {
                "gcode_macro MYCO_STATE": {
                    "variable_nozzle_diameter": 6.0,
                }
            }
        }
    }

    assert extract_nozzle_from_query_payload(payload) == 6.0


def test_query_payload_fails_when_variable_missing():
    payload = {"result": {"status": {"gcode_macro MYCO_STATE": {}}}}

    with pytest.raises(NozzleSyncError, match="no nozzle diameter"):
        extract_nozzle_from_query_payload(payload)


def test_nozzle_profile_mapping(tmp_path):
    mapping = tmp_path / "nozzle_profiles.json"
    mapping.write_text(
        json.dumps(
            {
                "profiles": [
                    {
                        "nozzle_diameter_mm": 6.0,
                        "profile_name": "MYCOFORGE_Paste_6mm",
                        "line_width_mm": 6.0,
                        "layer_height_mm": 2.4,
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    profiles = load_nozzle_profiles(mapping)

    assert profile_for_nozzle(6.0, profiles).profile_name == "MYCOFORGE_Paste_6mm"
    with pytest.raises(NozzleSyncError, match="No Orca nozzle profile"):
        profile_for_nozzle(7.0, profiles)


def test_gcode_validator_accepts_matching_nozzle():
    lines = [
        "; slicer_nozzle_mm = 6",
        "START_PRINT NOZZLE=6 LAYER_HEIGHT=2.4 LINE_WIDTH=6 E_RATE=10",
        "G1 X0 E1",
    ]

    assert ensure_start_print_nozzle(lines) == 6
    assert parse_gcode_slicer_nozzle(lines) == 6
    assert validate_gcode_nozzle(lines, 6.0) == 6


def test_gcode_validator_rejects_mismatch():
    lines = [
        "; slicer_nozzle_mm = 6",
        "START_PRINT NOZZLE=6 LAYER_HEIGHT=2.4 LINE_WIDTH=6 E_RATE=10",
    ]

    with pytest.raises(NozzleSyncError, match="does not match"):
        validate_gcode_nozzle(lines, 5.0)


def test_gcode_validator_requires_start_print_nozzle():
    with pytest.raises(NozzleSyncError, match="START_PRINT"):
        ensure_start_print_nozzle(["START_PRINT LAYER_HEIGHT=2 LINE_WIDTH=5"])
