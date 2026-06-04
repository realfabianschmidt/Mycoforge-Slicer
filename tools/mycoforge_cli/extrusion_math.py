"""Paste extrusion geometry math used by Klipper templates and tests."""

from __future__ import annotations

import math


def circle_area_mm2(diameter_mm: float) -> float:
    return math.pi * (diameter_mm / 2.0) ** 2


def pcp_rotation_distance_mm(
    *,
    virtual_filament_diameter_mm: float = 5.0,
    chambers: float = 8.0,
    eccentricity_mm: float = 3.0,
    rotor_radius_mm: float = 6.0,
    pitch_mm: float = 50.0,
    gear_ratio: float = 10.0,
    calibration_factor: float = 1.0,
) -> float:
    """Return Klipper E rotation_distance for a geared PCP stepper.

    The PCP volume formula is rotor-volume based. Klipper rotation_distance is
    configured at the motor/extruder stepper, so the rotor volume is divided by
    the mechanical gear ratio when no separate Klipper gear_ratio is configured.
    Nozzle diameter intentionally does not participate in this calculation.
    """
    filament_area = circle_area_mm2(virtual_filament_diameter_mm)
    rotor_volume_mm3 = chambers * eccentricity_mm * rotor_radius_mm * pitch_mm
    motor_volume_mm3 = rotor_volume_mm3 / gear_ratio
    return (motor_volume_mm3 / filament_area) * calibration_factor


def piston_queue_rotation_distance_mm(
    *,
    virtual_filament_diameter_mm: float = 5.0,
    cartridge_id_mm: float = 104.0,
    screw_lead_mm: float = 5.0,
    calibration_factor: float = 1.0,
) -> float:
    """Return queue-sync rotation_distance for a future extruder_stepper piston."""
    filament_area = circle_area_mm2(virtual_filament_diameter_mm)
    piston_volume_per_rev_mm3 = circle_area_mm2(cartridge_id_mm) * screw_lead_mm
    return (piston_volume_per_rev_mm3 / filament_area) * calibration_factor
