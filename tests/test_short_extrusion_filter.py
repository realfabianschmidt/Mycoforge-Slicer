from mycoforge_cli.short_extrusion_filter import filter_short_extrusions


def test_short_extrusion_filter_removes_and_rebases_absolute_e():
    output, stats = filter_short_extrusions(
        [
            "M82",
            "G92 E0",
            "G1 X1 Y0 E0.1 F900",
            "G1 X10 Y0 E1.1 F900",
        ],
        min_path_mm=5,
    )

    assert output[2] == "G1 X1 Y0 F900 ;MYCO_SKIPPED_SHORT_EXTRUSION length_mm=1 e_delta=0.1"
    assert output[3] == "G1 X10 Y0 E1 F900"
    assert stats.skipped_short_extrusions == 1
    assert stats.skipped_short_extrusion_e == 0.1


def test_short_extrusion_filter_keeps_relative_e_after_skipped_move():
    output, stats = filter_short_extrusions(
        [
            "M83",
            "G1 X1 Y0 E0.2 F900",
            "G1 X10 Y0 E1 F900",
        ],
        min_path_mm=5,
    )

    assert output[1] == "G1 X1 Y0 F900 ;MYCO_SKIPPED_SHORT_EXTRUSION length_mm=1 e_delta=0.2"
    assert output[2] == "G1 X10 Y0 E1 F900"
    assert stats.skipped_short_extrusions == 1
