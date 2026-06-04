# Retraction Model

The MVP keeps slicer retraction semantics visible and recoverable.

## annotate_only

This is the default mode. Mycoforge inserts event comments before retraction
and prime lines while keeping original G-code executable:

```gcode
;MYCO_EVENT RETRACT AMOUNT=1.200 SPEED=600
G1 E-1.200 F600
G0 X100 Y100 F6000
;MYCO_EVENT PRIME AMOUNT=1.200 SPEED=600
G1 E1.200 F600
```

## macro_translate

This mode replaces slicer retraction and prime commands with Klipper macros:

```gcode
MYCO_RETRACT AMOUNT=1.200 SPEED=600 MODE=pcp_pressure_relief
G0 X100 Y100 F6000
MYCO_PRIME AMOUNT=1.200 SPEED=600 MODE=controlled
```

Use `macro_translate` only after matching Klipper macros exist.
