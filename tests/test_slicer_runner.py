from __future__ import annotations

import json
import subprocess
from pathlib import Path

from mycoforge_cli import slicer_runner
from mycoforge_cli.slicer_manager import SlicerResolution
from mycoforge_cli.slicer_runner import SliceRequest


def test_build_orca_command_uses_orca_cli_flags(tmp_path):
    binary = tmp_path / "orca-slicer.exe"
    binary.write_text("", encoding="utf-8")
    model = tmp_path / "model.stl"
    model.write_text("solid fake\nendsolid fake\n", encoding="utf-8")
    output = tmp_path / "model.gcode"
    output_dir = tmp_path / "orca-output"

    command = slicer_runner.build_slicer_command(
        SliceRequest(model_path=model, output_path=output, slicer_binary=binary),
        output_dir=output_dir,
    )

    assert command[0] == str(binary)
    assert command[1:3] == ["--slice", "0"]
    assert command[3:5] == ["--outputdir", str(output_dir)]
    assert "--load-settings" in command
    settings_paths = command[command.index("--load-settings") + 1].split(";")
    assert settings_paths == [
        str(slicer_runner.ORCA_MACHINE_PROFILE),
        str(slicer_runner.ORCA_PROCESS_PROFILE),
    ]
    assert str(slicer_runner.ORCA_MACHINE_MODEL_PROFILE) not in settings_paths
    assert "--load-filaments" in command
    assert "--export-gcode" not in command
    assert "--output" not in command
    assert "--load" not in command
    assert command[-1] == str(model)


def test_build_orca_command_uses_managed_source(monkeypatch, tmp_path):
    binary = tmp_path / "slicer.exe"
    binary.write_text("", encoding="utf-8")
    model = tmp_path / "model.stl"
    model.write_text("solid fake\nendsolid fake\n", encoding="utf-8")
    output = tmp_path / "model.gcode"
    output_dir = tmp_path / "orca-output"

    monkeypatch.setattr(
        slicer_runner,
        "resolve_slicer",
        lambda: SlicerResolution(state="installed", source="orca", path=binary),
    )

    command = slicer_runner.build_slicer_command(
        SliceRequest(model_path=model, output_path=output),
        output_dir=output_dir,
    )

    assert command[0] == str(binary)
    assert command[1:3] == ["--slice", "0"]
    settings_paths = command[command.index("--load-settings") + 1].split(";")
    assert len(settings_paths) == 2
    assert "--export-gcode" not in command


def test_builtin_orca_profiles_are_compatible():
    machine_model = json.loads(slicer_runner.ORCA_MACHINE_MODEL_PROFILE.read_text(encoding="utf-8"))
    machine = json.loads(slicer_runner.ORCA_MACHINE_PROFILE.read_text(encoding="utf-8"))
    process = json.loads(slicer_runner.ORCA_PROCESS_PROFILE.read_text(encoding="utf-8"))
    filament = json.loads(slicer_runner.ORCA_FILAMENT_PROFILE.read_text(encoding="utf-8"))

    assert machine_model["type"] == "machine_model"
    assert machine_model["from"] == "user"
    assert machine_model["model_id"] == "mycoforge_klipper_250"
    assert "5" in machine_model["nozzle_diameter"]

    assert machine["printer_model"] == machine_model["name"]
    assert machine["setting_id"]
    assert process["setting_id"]
    assert filament["setting_id"]
    assert machine["name"] in process["compatible_printers"]
    assert machine["name"] in filament["compatible_printers"]
    assert machine["inherits"] in process["compatible_printers"]
    assert machine["inherits"] in filament["compatible_printers"]
    assert filament["filament_diameter"] == ["5"]
    assert process["compatible_printers_condition"] == ""
    assert filament["compatible_printers_condition"] == ""


def test_build_prusa_command_keeps_existing_flags(tmp_path):
    binary = tmp_path / "prusa-slicer-console.exe"
    profile = tmp_path / "profile.ini"
    model = tmp_path / "model.stl"
    output = tmp_path / "model.gcode"

    command = slicer_runner.build_slicer_command(
        SliceRequest(
            model_path=model,
            output_path=output,
            slicer_binary=binary,
            slicer_profile=profile,
            layer_height_mm=2,
            line_width_mm=5,
            print_speed_mm_s=15,
        )
    )

    assert command == [
        str(binary),
        "--export-gcode",
        "--output",
        str(output),
        "--load",
        str(profile),
        "--layer-height",
        "2",
        "--extrusion-width",
        "5",
        "--perimeter-speed",
        "15",
        str(model),
    ]


def test_orca_output_is_moved_to_requested_path(monkeypatch, tmp_path):
    binary = tmp_path / "orca-slicer.exe"
    binary.write_text("", encoding="utf-8")
    model = tmp_path / "model.stl"
    model.write_text("solid fake\nendsolid fake\n", encoding="utf-8")
    output = tmp_path / "model.gcode"

    def fake_run(command, **kwargs):
        output_dir = Path(command[command.index("--outputdir") + 1])
        settings_paths = command[command.index("--load-settings") + 1].split(";")
        assert len(settings_paths) == 2
        generated_machine = json.loads(Path(settings_paths[0]).read_text(encoding="utf-8"))
        generated_process = json.loads(Path(settings_paths[1]).read_text(encoding="utf-8"))
        generated_filament = json.loads(
            Path(command[command.index("--load-filaments") + 1]).read_text(encoding="utf-8")
        )
        assert generated_machine["nozzle_diameter"] == ["6"]
        assert generated_machine["name"] == "Mycoforge Klipper 250 6mm"
        assert generated_process["compatible_printers"][0] == generated_machine["name"]
        assert generated_filament["filament_diameter"] == ["5"]
        assert generated_process["layer_height"] == "2"
        assert generated_process["line_width"] == "5"
        assert generated_process["outer_wall_speed"] == "15"
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "orca_generated.gcode").write_text("G1 X1 E1\n", encoding="utf-8")
        return subprocess.CompletedProcess(command, 0, stdout="ok", stderr="")

    monkeypatch.setattr(slicer_runner.subprocess, "run", fake_run)

    result = slicer_runner.slice_model(
        SliceRequest(
            model_path=model,
            output_path=output,
            slicer_binary=binary,
            layer_height_mm=2,
            line_width_mm=5,
            print_speed_mm_s=15,
            nozzle_diameter_mm=6,
        )
    )

    assert result["ok"] is True
    assert output.read_text(encoding="utf-8") == "G1 X1 E1\n"
    assert not Path(str(result["orca_output_dir"])).exists()


def test_orca_process_applies_paste_toolpath_overrides(monkeypatch, tmp_path):
    binary = tmp_path / "orca-slicer.exe"
    binary.write_text("", encoding="utf-8")
    model = tmp_path / "model.stl"
    model.write_text("solid fake\nendsolid fake\n", encoding="utf-8")
    output = tmp_path / "model.gcode"

    def fake_run(command, **kwargs):
        output_dir = Path(command[command.index("--outputdir") + 1])
        process_path = Path(command[command.index("--load-settings") + 1].split(";")[1])
        generated_process = json.loads(process_path.read_text(encoding="utf-8"))
        assert generated_process["spiral_mode"] == "1"
        assert generated_process["spiral_mode_smooth"] == "1"
        assert generated_process["wall_loops"] == "1"
        assert generated_process["top_shell_layers"] == "0"
        assert generated_process["bottom_shell_layers"] == "1"
        assert generated_process["sparse_infill_density"] == "0%"
        assert generated_process["enable_support"] == "0"
        assert generated_process["filter_out_gap_fill"] == "7.5"
        assert generated_process["travel_speed"] == "80"
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "orca_generated.gcode").write_text("G1 X1 E1\n", encoding="utf-8")
        return subprocess.CompletedProcess(command, 0, stdout="ok", stderr="")

    monkeypatch.setattr(slicer_runner.subprocess, "run", fake_run)

    result = slicer_runner.slice_model(
        SliceRequest(
            model_path=model,
            output_path=output,
            slicer_binary=binary,
            line_width_mm=5,
            vase_mode=True,
            smooth_vase=True,
            filter_short_extrusions=True,
            min_extrusion_path_mm=7.5,
            travel_speed_mm_s=80,
            wall_loops=3,
            top_shell_layers=3,
            bottom_shell_layers=1,
            infill_density_percent=15,
        )
    )

    assert result["ok"] is True


def test_orca_machine_profile_uses_printer_geometry(monkeypatch, tmp_path):
    binary = tmp_path / "orca-slicer.exe"
    binary.write_text("", encoding="utf-8")
    model = tmp_path / "model.stl"
    model.write_text("solid fake\nendsolid fake\n", encoding="utf-8")
    output = tmp_path / "model.gcode"

    geometry = {
        "print_envelope": {
            "x": {"min_mm": 5, "max_mm": 325},
            "y": {"min_mm": 30, "max_mm": 325},
            "z": {"min_mm": 0, "max_mm": 160},
        }
    }

    def fake_run(command, **kwargs):
        output_dir = Path(command[command.index("--outputdir") + 1])
        machine_path = Path(command[command.index("--load-settings") + 1].split(";")[0])
        generated_machine = json.loads(machine_path.read_text(encoding="utf-8"))
        assert generated_machine["printable_area"] == [
            "5x30",
            "325x30",
            "325x325",
            "5x325",
        ]
        assert generated_machine["printable_height"] == "160"
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "orca_generated.gcode").write_text("G1 X5 Y30 E1\n", encoding="utf-8")
        return subprocess.CompletedProcess(command, 0, stdout="ok", stderr="")

    monkeypatch.setattr(slicer_runner.subprocess, "run", fake_run)

    result = slicer_runner.slice_model(
        SliceRequest(
            model_path=model,
            output_path=output,
            slicer_binary=binary,
            printer_geometry=geometry,
        )
    )

    assert result["ok"] is True


def test_orca_returncode_reports_failure(monkeypatch, tmp_path):
    binary = tmp_path / "orca-slicer.exe"
    binary.write_text("", encoding="utf-8")
    model = tmp_path / "model.stl"
    model.write_text("solid fake\nendsolid fake\n", encoding="utf-8")
    output = tmp_path / "model.gcode"

    def fake_run(command, **kwargs):
        return subprocess.CompletedProcess(command, 2, stdout="", stderr="bad flags")

    monkeypatch.setattr(slicer_runner.subprocess, "run", fake_run)

    result = slicer_runner.slice_model(
        SliceRequest(model_path=model, output_path=output, slicer_binary=binary)
    )

    assert result["ok"] is False
    assert result["returncode"] == 2
    assert result["stderr"] == "bad flags"
    assert "OrcaSlicer failed" in str(result["error"])
    assert "orca_output_dir" in result


def test_orca_profile_compatibility_error_is_explicit(monkeypatch, tmp_path):
    binary = tmp_path / "orca-slicer.exe"
    binary.write_text("", encoding="utf-8")
    model = tmp_path / "model.stl"
    model.write_text("solid fake\nendsolid fake\n", encoding="utf-8")
    output = tmp_path / "model.gcode"

    def fake_run(command, **kwargs):
        return subprocess.CompletedProcess(
            command,
            255,
            stdout="Slic3r::CLI::run 2559: process not compatible with printer.\n",
            stderr="",
        )

    monkeypatch.setattr(slicer_runner.subprocess, "run", fake_run)

    result = slicer_runner.slice_model(
        SliceRequest(model_path=model, output_path=output, slicer_binary=binary)
    )

    assert result["ok"] is False
    assert "built-in Mycoforge Orca profiles" in str(result["error"])
    assert str(result["orca_output_dir"]) in str(result["error"])


def test_orca_missing_output_reports_failure(monkeypatch, tmp_path):
    binary = tmp_path / "orca-slicer.exe"
    binary.write_text("", encoding="utf-8")
    model = tmp_path / "model.stl"
    model.write_text("solid fake\nendsolid fake\n", encoding="utf-8")
    output = tmp_path / "model.gcode"

    def fake_run(command, **kwargs):
        return subprocess.CompletedProcess(command, 0, stdout="ok", stderr="")

    monkeypatch.setattr(slicer_runner.subprocess, "run", fake_run)

    result = slicer_runner.slice_model(
        SliceRequest(model_path=model, output_path=output, slicer_binary=binary)
    )

    assert result["ok"] is False
    assert "No G-code file was produced" in str(result["error"])
    assert result["command"][1:3] == ["--slice", "0"]
    assert "orca_output_dir" in result
