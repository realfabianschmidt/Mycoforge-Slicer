import json

import pytest

from mycoforge_cli.layout_transform import (
    LayoutTransform,
    LayoutTransformError,
    apply_layout_transform,
    layout_transform_from_json,
    layout_transform_header,
)


def test_layout_transform_offsets_absolute_xyz_moves():
    output = apply_layout_transform(
        [
            "G90",
            "G1 X10 Y20 Z0.2 E1 F900 ; print move",
            "G0 X5 F3000",
        ],
        LayoutTransform(translate_x_mm=20, translate_y_mm=-10, translate_z_mm=1.5),
    )

    assert output == [
        "G90",
        "G1 X30 Y10 Z1.7 E1 F900 ; print move",
        "G0 X25 F3000",
    ]


def test_layout_transform_preserves_e_f_comments_and_unknown_params():
    output = apply_layout_transform(
        ["G1 X1.25 Y2.5 E0.4 F1200 A9 ; keep this"],
        LayoutTransform(translate_x_mm=0.75, translate_y_mm=1.5),
    )

    assert output == ["G1 X2 Y4 E0.4 F1200 A9 ; keep this"]


def test_layout_transform_rejects_relative_coordinate_moves_with_offset():
    with pytest.raises(LayoutTransformError, match="relative X,Y move"):
        apply_layout_transform(
            [
                "G91",
                "G1 X10 Y20 E1",
            ],
            LayoutTransform(translate_x_mm=20, translate_y_mm=10),
        )


def test_layout_transform_json_and_header():
    transform = layout_transform_from_json(
        json.dumps({"translateXMm": 12.5, "translateYMm": -3, "translateZMm": 0})
    )

    assert transform == LayoutTransform(translate_x_mm=12.5, translate_y_mm=-3, translate_z_mm=0)
    assert layout_transform_header(transform) == [
        "; mycoforge_layout_transform = post_slice_offset",
        "; layout_offset_x_mm = 12.5",
        "; layout_offset_y_mm = -3",
        "; layout_offset_z_mm = 0",
    ]


def test_layout_transform_json_validation():
    with pytest.raises(LayoutTransformError, match="must be an object"):
        layout_transform_from_json("[]")

    with pytest.raises(LayoutTransformError, match="translateXMm must be a number"):
        layout_transform_from_json(json.dumps({"translateXMm": "bad"}))
