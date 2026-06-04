import json

from typer.testing import CliRunner

from mycoforge_cli import main as cli
from mycoforge_cli.calibration_gcode import VALID_CALIBRATION_PATTERNS, generate_calibration_gcode
from mycoforge_cli.profiles import material_defaults


def material():
    return material_defaults(
        {
            "id": "calibration",
            "line_width_mm": 5,
            "layer_height_mm": 2,
            "print_speed_mm_s": 15,
            "motion": {"acceleration_mm_s2": 300, "square_corner_velocity": 2},
            "paste": {"virtual_e_area_mm2": 19.635},
            "flow": {"normalize_print_feedrate": True, "max_volumetric_flow_mm3_s": 250},
        }
    )


def test_all_calibration_patterns_generate_gcode():
    for pattern in VALID_CALIBRATION_PATTERNS:
        gcode = "\n".join(generate_calibration_gcode(pattern, material()))
        assert f"; calibration_pattern = {pattern}" in gcode
        assert ";MYCO_START MATERIAL=calibration" in gcode
        assert "G1 " in gcode


def test_calibration_gcode_cli_writes_selected_pattern(tmp_path):
    profile = tmp_path / "material.json"
    out = tmp_path / "flow.gcode"
    profile.write_text(
        json.dumps(
            {
                "id": "calibration",
                "line_width_mm": 5,
                "layer_height_mm": 2,
                "print_speed_mm_s": 15,
                "motion": {"acceleration_mm_s2": 300, "square_corner_velocity": 2},
                "paste": {"virtual_e_area_mm2": 19.635},
                "flow": {"normalize_print_feedrate": True},
            }
        ),
        encoding="utf-8",
    )

    result = CliRunner().invoke(
        cli.app,
        [
            "calibration-gcode",
            "--out",
            str(out),
            "--profile",
            str(profile),
            "--pattern",
            "flow_ladder",
        ],
    )

    assert result.exit_code == 0, result.output
    assert "; calibration_pattern = flow_ladder" in out.read_text(encoding="utf-8")
