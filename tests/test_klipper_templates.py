from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def test_myco_state_keeps_nozzle_out_of_rotation_distance_math():
    template = (REPO_ROOT / "klipper" / "myco_state.cfg").read_text(encoding="utf-8")
    apply_block = template.split("[gcode_macro APPLY_MYCO_EXTRUSION_CONFIG]", 1)[1]

    assert "nozzle_diameter" not in apply_block
    assert "SET_EXTRUDER_ROTATION_DISTANCE EXTRUDER=extruder" in apply_block
    assert "EXTRUDER=piston" not in apply_block


def test_queue_sync_template_is_disabled_and_does_not_use_manual_stepper_homing():
    template = (REPO_ROOT / "klipper" / "myco_queue_sync_experimental.cfg.disabled").read_text(
        encoding="utf-8"
    )

    assert "#[extruder_stepper piston]" in template
    assert "#    SYNC_EXTRUDER_MOTION EXTRUDER=piston MOTION_QUEUE=extruder" in template
    assert "MANUAL_STEPPER STEPPER=piston" not in template
