from pathlib import Path

from mycoforge_cli.paste_contract import (
    BED_MESH_MODES,
    COMMENT_ONLY_CONTRACT,
    MYCO_MACRO_CONTRACT,
    build_mycoforge_header,
    macro_contract,
    normalize_bed_mesh_mode,
    object_definition_from_gcode,
    paste_metrics,
    safe_retraction_translation_mode,
)


def test_paste_metrics_calculates_virtual_e_rate():
    material = {
        "line_width_mm": 5,
        "layer_height_mm": 2,
        "print_speed_mm_s": 15,
        "paste": {"virtual_e_area_mm2": 19.635},
        "flow": {"max_volumetric_flow_mm3_s": 250},
    }

    metrics = paste_metrics(material)

    assert metrics.volumetric_flow_mm3_s == 150
    assert metrics.slicer_nozzle_mm == 5
    assert round(metrics.virtual_e_rate_mm_s, 4) == 7.6394
    assert metrics.max_volumetric_flow_mm3_s == 250


def test_comment_only_contract_downgrades_unknown_myco_macros():
    material = {
        "retraction": {"translation_mode": "macro_translate"},
        "klipper": {"macro_contract": COMMENT_ONLY_CONTRACT},
    }

    assert macro_contract(material) == COMMENT_ONLY_CONTRACT
    assert safe_retraction_translation_mode(material) == "annotate_only"


def test_header_uses_comments_for_myco_contract_and_object_define():
    material = {
        "id": "paste",
        "line_width_mm": 5,
        "layer_height_mm": 2,
        "print_speed_mm_s": 15,
        "motion": {"acceleration_mm_s2": 300, "square_corner_velocity": 2},
        "paste": {"virtual_e_area_mm2": 19.635},
    }
    object_definition = object_definition_from_gcode(
        [
            "M82",
            "G92 E0",
            "G1 X10 Y20 E1 F900",
            "G1 X30 Y40 E2 F900",
        ],
        Path("Part A.gcode"),
    )

    header = build_mycoforge_header(material, object_definition=object_definition)

    assert ";MYCO_START MATERIAL=paste" in "\n".join(header)
    assert (
        "START_PRINT NOZZLE=5 LAYER_HEIGHT=2 LINE_WIDTH=5 E_RATE=7.6394 BED_MESH=always"
        in "\n".join(header)
    )
    assert "; slicer_nozzle_mm = 5" in "\n".join(header)
    assert "EXCLUDE_OBJECT_DEFINE NAME=Part_A CENTER=15,20" in "\n".join(header)
    assert not any(line.startswith("MYCO_") for line in header)


def test_myco_macro_contract_allows_real_myco_start():
    header = build_mycoforge_header(
        {
            "id": "paste",
            "line_width_mm": 5,
            "layer_height_mm": 2,
            "print_speed_mm_s": 15,
            "klipper": {"macro_contract": MYCO_MACRO_CONTRACT},
        }
    )

    assert any(line.startswith("MYCO_START MATERIAL=paste") for line in header)


def _material_for_bed_mesh() -> dict:
    return {
        "id": "paste",
        "line_width_mm": 5,
        "layer_height_mm": 2,
        "print_speed_mm_s": 15,
        "paste": {"virtual_e_area_mm2": 19.635},
    }


def test_bed_mesh_default_is_always():
    header = build_mycoforge_header(_material_for_bed_mesh())
    start_line = next(line for line in header if line.startswith("START_PRINT"))
    assert start_line.endswith("BED_MESH=always")


def test_bed_mesh_load_token_appears_in_header():
    header = build_mycoforge_header(_material_for_bed_mesh(), bed_mesh_mode="load")
    start_line = next(line for line in header if line.startswith("START_PRINT"))
    assert "BED_MESH=load" in start_line


def test_bed_mesh_skip_token_appears_in_header():
    header = build_mycoforge_header(_material_for_bed_mesh(), bed_mesh_mode="skip")
    start_line = next(line for line in header if line.startswith("START_PRINT"))
    assert "BED_MESH=skip" in start_line


def test_unknown_bed_mesh_mode_falls_back_to_always():
    header = build_mycoforge_header(_material_for_bed_mesh(), bed_mesh_mode="bogus")
    start_line = next(line for line in header if line.startswith("START_PRINT"))
    assert "BED_MESH=always" in start_line


def test_normalize_bed_mesh_mode_exposes_supported_modes():
    assert set(BED_MESH_MODES) == {"always", "load", "skip"}
    assert normalize_bed_mesh_mode(None) == "always"
    assert normalize_bed_mesh_mode("LOAD") == "load"
    assert normalize_bed_mesh_mode("nope") == "always"
