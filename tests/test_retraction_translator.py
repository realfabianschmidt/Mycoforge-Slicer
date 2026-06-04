from pathlib import Path

from mycoforge_cli.gcode_parser import parse_lines
from mycoforge_cli.retraction_translator import translate_retractions


FIXTURES = Path(__file__).parent / "fixtures"


def test_annotate_only_inserts_events_and_keeps_original_gcode():
    lines = (FIXTURES / "retract_travel_prime.gcode").read_text(encoding="utf-8").splitlines()
    output = translate_retractions(parse_lines(lines), translation_mode="annotate_only")

    assert ";MYCO_EVENT RETRACT AMOUNT=0.8 SPEED=600" in output
    assert "G1 E0.200 F600" in output
    assert "G0 X100 Y100 F6000" in output
    assert ";MYCO_EVENT PRIME AMOUNT=0.8 SPEED=600" in output
    assert "G1 E1.000 F600" in output


def test_macro_translate_replaces_only_retract_and_prime():
    lines = (FIXTURES / "relative_retract.gcode").read_text(encoding="utf-8").splitlines()
    output = translate_retractions(
        parse_lines(lines),
        translation_mode="macro_translate",
        macro_mode="pcp_pressure_relief",
    )

    assert "MYCO_RETRACT AMOUNT=1.2 SPEED=600 MODE=pcp_pressure_relief" in output
    assert "G1 E-1.200 F600" not in output
    assert "G0 X20 Y20 F6000" in output
    assert "MYCO_PRIME AMOUNT=1.25 SPEED=600 MODE=controlled" in output
    assert "G1 E1.250 F600" not in output
