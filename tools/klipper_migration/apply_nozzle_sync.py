"""Apply the Mycoforge nozzle-sync migration to an external Klipper config."""

from __future__ import annotations

from pathlib import Path
import shutil
import sys


REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCE_MYCO_STATE = REPO_ROOT / "klipper" / "myco_state.cfg"
SOURCE_QUEUE_TEMPLATE = REPO_ROOT / "klipper" / "myco_queue_sync_experimental.cfg.disabled"


START_PRINT_BLOCK = """[gcode_macro START_PRINT]
description: Druckstart fuer Paste-Extruder mit Nozzle-Safety
variable_state: 'Prepare'
variable_record_extruder_temp: 0
variable_max_record_extruder_temp: 0
variable_slicer_nozzle: 0.0
variable_layer_height: 0.0
variable_line_width: 0.0
variable_e_rate: 2.0
gcode:
    M400
    CLEAR_PAUSE
    G90

    {% if state == 'Prepare' %}
        {% if params.NOZZLE is not defined %}
            {action_raise_error("START_PRINT requires NOZZLE=<mm> from the slicer.")}
        {% endif %}
        {% set slicer_nozzle = params.NOZZLE|float %}
        {% set layer_height = params.LAYER_HEIGHT|default(0)|float %}
        {% set line_width = params.LINE_WIDTH|default(0)|float %}
        {% set e_rate = params.E_RATE|default(2.0)|float %}
        {% set printer_nozzle = printer["gcode_macro MYCO_STATE"].nozzle_diameter|float %}
        {% set max_cross_section = printer["gcode_macro MYCO_STATE"].max_cross_section_mm2|float %}
        {% set cross_section = layer_height * line_width %}

        {% if (slicer_nozzle - printer_nozzle)|abs > 0.001 %}
            {action_raise_error("Slicer nozzle %.3f does not match printer nozzle %.3f. Set printer nozzle or reslice." % (slicer_nozzle, printer_nozzle))}
        {% endif %}
        {% if layer_height <= 0 or line_width <= 0 %}
            {action_raise_error("START_PRINT requires positive LAYER_HEIGHT and LINE_WIDTH.")}
        {% endif %}
        {% if cross_section > max_cross_section %}
            {action_raise_error("Paste cross-section %.3f mm^2 exceeds configured limit %.3f mm^2." % (cross_section, max_cross_section))}
        {% endif %}

        SET_GCODE_VARIABLE MACRO=START_PRINT VARIABLE=slicer_nozzle VALUE={slicer_nozzle}
        SET_GCODE_VARIABLE MACRO=START_PRINT VARIABLE=layer_height VALUE={layer_height}
        SET_GCODE_VARIABLE MACRO=START_PRINT VARIABLE=line_width VALUE={line_width}
        SET_GCODE_VARIABLE MACRO=START_PRINT VARIABLE=e_rate VALUE={e_rate}
        SET_GCODE_VARIABLE MACRO=MYCO_STATE VARIABLE=last_slicer_nozzle VALUE={slicer_nozzle}

        {action_respond_info("Prepare! Nozzle %.3f mm, layer %.3f mm, line %.3f mm, E_RATE %.4f mm/s" % (slicer_nozzle, layer_height, line_width, e_rate))}

        {% if printer.toolhead.homed_axes|lower != "xyz" %}
            G28
        {% endif %}

        {% if printer.quad_gantry_level.applied|lower != 'true' %}
            QUAD_GANTRY_LEVEL
        {% endif %}

        {% set bed_mesh_mode = params.BED_MESH|default('always')|lower %}
        {% if bed_mesh_mode == 'skip' %}
            BED_MESH_CLEAR
            {action_respond_info("Bed mesh skipped by slicer (BED_MESH=skip).")}
        {% elif bed_mesh_mode == 'load' %}
            {% if printer.bed_mesh.profile_name == 'default' %}
                {action_respond_info("Reusing active bed mesh 'default'.")}
            {% elif 'default' in (printer.bed_mesh.profiles|default({})) %}
                BED_MESH_PROFILE LOAD=default
                {action_respond_info("Loaded saved bed mesh 'default'.")}
            {% else %}
                {action_respond_info("No saved bed mesh — calibrating fresh.")}
                BED_MESH_CALIBRATE ADAPTIVE=1
            {% endif %}
        {% else %}
            BED_MESH_CALIBRATE ADAPTIVE=1
        {% endif %}

        SET_GCODE_VARIABLE MACRO=START_PRINT VARIABLE=state VALUE='"Start"'
        UPDATE_DELAYED_GCODE ID=_print_start_wait DURATION=0.5

    {% elif state == 'Start' %}
        {% set stored = printer["gcode_macro START_PRINT"] %}
        APPLY_MYCO_EXTRUSION_CONFIG
        PISTON_SYNC_START E_RATE={stored.e_rate|float}
        M117 Printing now!!!
        # save_last_file is only valid when the Obico macro is active.
        # save_last_file
        {action_respond_info("Start!")}
        SET_GCODE_VARIABLE MACRO=START_PRINT VARIABLE=state VALUE='"Prepare"'
    {% endif %}

"""


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    if len(args) != 1:
        print("Usage: python tools/klipper_migration/apply_nozzle_sync.py <klipper_config_dir>", file=sys.stderr)
        return 2

    target = Path(args[0]).resolve()
    if not target.is_dir():
        print(f"Klipper config directory does not exist: {target}", file=sys.stderr)
        return 1

    _copy_template(SOURCE_MYCO_STATE, target / "myco_state.cfg")
    _copy_template(SOURCE_QUEUE_TEMPLATE, target / "myco_queue_sync_experimental.cfg.disabled")
    _update_printer_cfg(target / "printer.cfg")
    _update_macro_cfg(target / "Macro.cfg")
    print(f"Applied Mycoforge nozzle-sync migration to {target}")
    return 0


def _copy_template(source: Path, destination: Path) -> None:
    _backup(destination)
    shutil.copyfile(source, destination)


def _update_printer_cfg(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if "[include myco_state.cfg]" not in text:
        marker = "[include paste_macros.cfg]\n"
        if marker not in text:
            raise RuntimeError("printer.cfg does not include paste_macros.cfg; refusing automatic include edit.")
        text = text.replace(marker, marker + "[include myco_state.cfg]\n", 1)
        _backup(path)
        path.write_text(text, encoding="utf-8")


def _update_macro_cfg(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    start = text.index("[gcode_macro START_PRINT]")
    end = text.index("[gcode_macro END_PRINT]", start)
    text = text[:start] + START_PRINT_BLOCK + text[end:]
    old_resume = "    PISTON_SYNC_START\n    RESUME_BASE"
    new_resume = (
        "    PISTON_SYNC_START E_RATE={printer[\"gcode_macro START_PRINT\"].e_rate|default(2.0)|float}\n"
        "    RESUME_BASE"
    )
    text = text.replace(old_resume, new_resume)
    _backup(path)
    path.write_text(text, encoding="utf-8")


def _backup(path: Path) -> None:
    if not path.exists():
        return
    backup = path.with_name(f"{path.name}.bak-mycoforge-nozzle-sync")
    if not backup.exists():
        shutil.copyfile(path, backup)


if __name__ == "__main__":
    raise SystemExit(main())
