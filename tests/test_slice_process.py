import json
from pathlib import Path

from typer.testing import CliRunner

from mycoforge_cli import main as cli


def test_slice_process_slices_raw_then_processes_final_gcode(monkeypatch, tmp_path):
    model = tmp_path / "model.stl"
    model.write_text("solid fake\nendsolid fake\n", encoding="utf-8")
    output = tmp_path / "model_mycoforge.gcode"
    profile = tmp_path / "material.json"
    profile.write_text(
        json.dumps(
            {
                "id": "test_material",
                "name": "Test Material",
                "line_width_mm": 5,
                "layer_height_mm": 2,
                "print_speed_mm_s": 15,
                "retraction": {"enabled": True, "translation_mode": "annotate_only", "mode": "pcp_only"},
                "motion": {"acceleration_mm_s2": 300, "square_corner_velocity": 2},
                "flow": {
                    "normalize_print_feedrate": True,
                    "max_volumetric_flow_mm3_s": 250,
                    "virtual_filament_diameter_mm": 5,
                },
                "paste": {"virtual_e_area_mm2": 19.635},
                "klipper": {"macro_contract": "comment_only", "supports_exclude_object": True},
            }
        ),
        encoding="utf-8",
    )

    def fake_slice_model(request):
        request.output_path.write_text(
            "\n".join(
                [
                    "M82",
                    "G92 E0",
                    "G1 X10 Y10 E1.000 F1200",
                    "G1 E0.200 F600",
                    "G0 X20 Y20 F6000",
                    "G1 E1.000 F600",
                ]
            ),
            encoding="utf-8",
        )
        return {"ok": True, "output_path": str(request.output_path)}

    monkeypatch.setattr(cli, "slice_model", fake_slice_model)

    result = CliRunner().invoke(
        cli.app,
        [
            "slice-process",
            str(model),
            "--out",
            str(output),
            "--profile",
            str(profile),
            "--layout-transform-json",
            json.dumps({"translateXMm": 5, "translateYMm": -3, "translateZMm": 0}),
        ],
    )

    assert result.exit_code == 0, result.output
    assert output.is_file()
    raw_gcode = tmp_path / "model_mycoforge.slicer_raw.gcode"
    assert raw_gcode.is_file()
    assert "G1 X10 Y10 E1.000 F1200" in raw_gcode.read_text(encoding="utf-8")
    final_gcode = output.read_text(encoding="utf-8")
    assert "G1 X15 Y7 E1.000 F900" in final_gcode
    assert "G0 X25 Y17 F6000" in final_gcode
    assert "; layout_offset_x_mm = 5" in final_gcode
    assert "; layout_offset_y_mm = -3" in final_gcode
    assert ";MYCO_START MATERIAL=test_material" in final_gcode
    assert "START_PRINT NOZZLE=5 LAYER_HEIGHT=2 LINE_WIDTH=5 E_RATE=7.6394" in final_gcode
    assert ";MYCO_END" in final_gcode
    assert "volumetric_flow_mm3_s = 150" in final_gcode
    assert "virtual_e_rate_mm_s = 7.6394" in final_gcode
    assert "EXCLUDE_OBJECT_DEFINE NAME=model_mycoforge_slicer_raw" in final_gcode
    assert not any(line.startswith("MYCO_") for line in final_gcode.splitlines())
    assert ";MYCO_EVENT RETRACT" in final_gcode


def test_slice_process_can_sync_nozzle_from_moonraker(monkeypatch, tmp_path):
    model = tmp_path / "model.stl"
    model.write_text("solid fake\nendsolid fake\n", encoding="utf-8")
    output = tmp_path / "model_mycoforge.gcode"
    profile = tmp_path / "material.json"
    profile.write_text(
        json.dumps(
            {
                "id": "test_material",
                "name": "Test Material",
                "line_width_mm": 6,
                "layer_height_mm": 2.4,
                "print_speed_mm_s": 15,
                "retraction": {"enabled": False},
                "motion": {"acceleration_mm_s2": 300, "square_corner_velocity": 2},
                "flow": {"normalize_print_feedrate": False, "virtual_filament_diameter_mm": 5},
                "paste": {"nozzle_diameter_mm": 5},
                "klipper": {"macro_contract": "comment_only"},
            }
        ),
        encoding="utf-8",
    )
    captured = {}

    def fake_query_printer_nozzle(url):
        captured["url"] = url
        return 6.0

    def fake_slice_model(request):
        captured["request_nozzle"] = request.nozzle_diameter_mm
        request.output_path.write_text("G1 X0 Y0 E1\n", encoding="utf-8")
        return {"ok": True, "output_path": str(request.output_path)}

    monkeypatch.setattr(cli, "query_printer_nozzle", fake_query_printer_nozzle)
    monkeypatch.setattr(cli, "slice_model", fake_slice_model)

    result = CliRunner().invoke(
        cli.app,
        [
            "slice-process",
            str(model),
            "--out",
            str(output),
            "--profile",
            str(profile),
            "--sync-printer-nozzle",
            "--moonraker-url",
            "http://printer.local:7125",
        ],
    )

    assert result.exit_code == 0, result.output
    assert captured == {"url": "http://printer.local:7125", "request_nozzle": 6.0}
    assert "START_PRINT NOZZLE=6" in output.read_text(encoding="utf-8")


def test_nozzle_query_command_returns_printer_nozzle(monkeypatch):
    monkeypatch.setattr(cli, "query_printer_nozzle", lambda url: 6.0)

    result = CliRunner().invoke(
        cli.app,
        [
            "nozzle-query",
            "--moonraker",
            "http://printer.local:7125",
        ],
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload == {"ok": True, "nozzle_diameter": 6.0}
