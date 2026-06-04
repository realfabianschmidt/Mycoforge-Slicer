from mycoforge_cli.extrusion_math import (
    pcp_rotation_distance_mm,
    piston_queue_rotation_distance_mm,
)


def test_current_pcp_rotation_distance_matches_5mm_virtual_e_model():
    assert round(pcp_rotation_distance_mm(virtual_filament_diameter_mm=5.0), 1) == 36.7


def test_175mm_pcp_rotation_distance_keeps_gear_ratio_out_of_nozzle_logic():
    assert round(pcp_rotation_distance_mm(virtual_filament_diameter_mm=1.75), 1) == 299.3


def test_piston_queue_rotation_distance_uses_cartridge_not_nozzle():
    current = piston_queue_rotation_distance_mm(
        virtual_filament_diameter_mm=5.0,
        cartridge_id_mm=104.0,
        screw_lead_mm=5.0,
    )
    same_with_other_nozzle = piston_queue_rotation_distance_mm(
        virtual_filament_diameter_mm=5.0,
        cartridge_id_mm=104.0,
        screw_lead_mm=5.0,
    )

    assert round(current, 1) == 2163.2
    assert same_with_other_nozzle == current
