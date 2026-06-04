from mycoforge_cli.gcode_parser import parse_lines


def test_parser_preserves_comments_and_detects_modes():
    parsed = parse_lines(
        [
            ";TYPE:WALL-OUTER",
            ";LAYER:3",
            "M83 ; relative extrusion",
            "G1 X10 Y10 E0.5 F900",
        ]
    )

    assert parsed[0].line_type == "comment"
    assert parsed[0].original == ";TYPE:WALL-OUTER"
    assert parsed[1].line_type == "layer_change"
    assert parsed[2].command == "M83"
    assert parsed[2].extrusion_mode == "relative"
    assert parsed[3].line_type == "extrude_move"
    assert parsed[3].extrusion_mode == "relative"


def test_parser_classifies_absolute_retract_travel_prime():
    lines = [
        "M82",
        "G92 E0",
        "G1 X10 Y10 E1.000 F900",
        "G1 E0.200 F600",
        "G0 X100 Y100 F6000",
        "G1 E1.000 F600",
    ]

    parsed = parse_lines(lines)

    assert [line.line_type for line in parsed] == [
        "command",
        "command",
        "extrude_move",
        "retract",
        "travel_move",
        "prime",
    ]
    assert parsed[3].amount == 0.8
    assert parsed[5].amount == 0.8


def test_parser_classifies_relative_retract_and_prime_without_xy():
    parsed = parse_lines(
        [
            "M83",
            "G1 X10 Y10 E0.500 F900",
            "G1 E-1.200 F600",
            "G0 X20 Y20 F6000",
            "G1 E1.250 F600",
        ]
    )

    assert parsed[1].line_type == "extrude_move"
    assert parsed[2].line_type == "retract"
    assert parsed[2].amount == 1.2
    assert parsed[3].line_type == "travel_move"
    assert parsed[4].line_type == "prime"
    assert parsed[4].amount == 1.25


def test_z_only_move_is_layer_change():
    parsed = parse_lines(["G1 Z2.000 F300"])

    assert parsed[0].line_type == "layer_change"
