from pathlib import Path

from mycoforge_cli.flow_normalizer import normalize_feedrates
from mycoforge_cli.gcode_parser import parse_lines


FIXTURES = Path(__file__).parent / "fixtures"


def test_normalizer_changes_only_extrude_move_feedrates():
    lines = (FIXTURES / "retract_travel_prime.gcode").read_text(encoding="utf-8").splitlines()
    parsed = parse_lines(lines)

    output = normalize_feedrates(parsed, target_print_speed_mm_s=15)

    assert output[0] == "; processed_by = Mycoforge Flow Normalizer"
    assert "G1 X10 Y10 E1.000 F900" in output
    assert "G1 E0.200 F600" in output
    assert "G0 X100 Y100 F6000" in output
    assert "G1 E1.000 F600" in output
    assert "G1 X120 Y100 E1.800 F900" in output


def test_normalizer_preserves_comments_and_layer_changes():
    lines = (FIXTURES / "simple_line.gcode").read_text(encoding="utf-8").splitlines()
    parsed = parse_lines(lines)

    output = normalize_feedrates(parsed, target_print_speed_mm_s=20)

    assert ";LAYER:0" in output
    assert "M82 ; absolute extrusion" in output
    assert "G1 Z2.000 F300" in output
    assert "G1 X10 Y10 E0.800 F1200" in output
