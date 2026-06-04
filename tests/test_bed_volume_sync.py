import pytest

from mycoforge_cli.bed_volume_sync import (
    BedVolumeSyncError,
    extract_bed_volume_from_query_payload,
)


def _toolhead_payload(axis_min, axis_max, kinematics: str = "corexy"):
    payload = {
        "result": {
            "status": {
                "toolhead": {
                    "axis_minimum": axis_min,
                    "axis_maximum": axis_max,
                }
            }
        }
    }
    if kinematics:
        payload["result"]["status"]["configfile"] = {
            "settings": {"printer": {"kinematics": kinematics}}
        }
    return payload


def _configfile_payload(stepper_x, stepper_y, stepper_z, kinematics: str = "cartesian"):
    return {
        "result": {
            "status": {
                "configfile": {
                    "settings": {
                        "stepper_x": stepper_x,
                        "stepper_y": stepper_y,
                        "stepper_z": stepper_z,
                        "printer": {"kinematics": kinematics},
                    }
                }
            }
        }
    }


def _myco_geometry_payload(
    *,
    nozzle=(0, 335, 30, 335, 0, 160),
    printable=(5, 325, 30, 325, 0, 160),
    kinematics: str = "corexy",
):
    nozzle_x_min, nozzle_x_max, nozzle_y_min, nozzle_y_max, nozzle_z_min, nozzle_z_max = nozzle
    print_x_min, print_x_max, print_y_min, print_y_max, print_z_min, print_z_max = printable
    return {
        "result": {
            "status": {
                "gcode_macro _myco_geometry": {
                    "nozzle_x_min": nozzle_x_min,
                    "nozzle_x_max": nozzle_x_max,
                    "nozzle_y_min": nozzle_y_min,
                    "nozzle_y_max": nozzle_y_max,
                    "nozzle_z_min": nozzle_z_min,
                    "nozzle_z_max": nozzle_z_max,
                    "print_x_min": print_x_min,
                    "print_x_max": print_x_max,
                    "print_y_min": print_y_min,
                    "print_y_max": print_y_max,
                    "print_z_min": print_z_min,
                    "print_z_max": print_z_max,
                },
                "toolhead": {
                    "axis_minimum": [0, 30, 0, 0],
                    "axis_maximum": [335, 335, 160, 0],
                },
                "configfile": {"settings": {"printer": {"kinematics": kinematics}}},
            }
        }
    }


def test_extracts_myco_geometry_before_toolhead():
    payload = _myco_geometry_payload()
    volume = extract_bed_volume_from_query_payload(payload)
    assert volume.size_x_mm == 320.0
    assert volume.size_y_mm == 295.0
    assert volume.height_z_mm == 160.0
    assert volume.min_x_mm == 5.0
    assert volume.max_x_mm == 325.0
    assert volume.min_y_mm == 30.0
    assert volume.max_y_mm == 325.0
    assert volume.move_envelope.x.min_mm == 0.0
    assert volume.move_envelope.x.max_mm == 335.0
    assert volume.kinematics == "corexy"
    assert volume.source == "myco_geometry"


def test_rejects_myco_geometry_print_envelope_outside_movement_envelope():
    payload = _myco_geometry_payload(printable=(-5, 325, 30, 325, 0, 160))
    with pytest.raises(BedVolumeSyncError, match="outside the movement envelope"):
        extract_bed_volume_from_query_payload(payload)


def test_extracts_from_toolhead():
    payload = _toolhead_payload([0.0, 0.0, 0.0, 0.0], [350.0, 350.0, 400.0, 0.0])
    volume = extract_bed_volume_from_query_payload(payload)
    assert volume.size_x_mm == 350.0
    assert volume.size_y_mm == 350.0
    assert volume.height_z_mm == 400.0
    assert volume.min_x_mm == 0.0
    assert volume.max_x_mm == 350.0
    assert volume.kinematics == "corexy"
    assert volume.source == "toolhead"


def test_extracts_from_toolhead_with_negative_minima():
    # Delta-style: origin in the centre of the bed.
    payload = _toolhead_payload([-150.0, -150.0, 0.0, 0.0], [150.0, 150.0, 300.0, 0.0])
    volume = extract_bed_volume_from_query_payload(payload)
    assert volume.size_x_mm == 300.0
    assert volume.size_y_mm == 300.0
    assert volume.height_z_mm == 300.0


def test_falls_back_to_configfile_when_toolhead_missing():
    payload = _configfile_payload(
        stepper_x={"position_min": 0, "position_max": 250},
        stepper_y={"position_min": 0, "position_max": 220},
        stepper_z={"position_min": 0, "position_max": 240},
        kinematics="cartesian",
    )
    volume = extract_bed_volume_from_query_payload(payload)
    assert volume.size_x_mm == 250.0
    assert volume.size_y_mm == 220.0
    assert volume.height_z_mm == 240.0
    assert volume.min_x_mm == 0.0
    assert volume.max_x_mm == 250.0
    assert volume.kinematics == "cartesian"
    assert volume.source == "configfile"


def test_configfile_handles_missing_position_min():
    payload = _configfile_payload(
        stepper_x={"position_max": 250},
        stepper_y={"position_max": 250},
        stepper_z={"position_max": 250},
    )
    volume = extract_bed_volume_from_query_payload(payload)
    assert volume.size_x_mm == 250.0


def test_configfile_uses_endstop_when_position_max_absent():
    payload = _configfile_payload(
        stepper_x={"position_endstop": 200},
        stepper_y={"position_endstop": 200},
        stepper_z={"position_endstop": 200},
    )
    volume = extract_bed_volume_from_query_payload(payload)
    assert volume.size_x_mm == 200.0


def test_rejects_payload_without_axes_or_config():
    payload = {"result": {"status": {"toolhead": {}}}}
    with pytest.raises(BedVolumeSyncError, match="no bed-volume data"):
        extract_bed_volume_from_query_payload(payload)


def test_rejects_non_positive_extent():
    payload = _toolhead_payload([10, 10, 10, 0], [10, 10, 10, 0])
    with pytest.raises(BedVolumeSyncError, match="no bed-volume data"):
        extract_bed_volume_from_query_payload(payload)
