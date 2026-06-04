# G-Code Rules

## Supported MVP Semantics

- `M82` switches to absolute extrusion mode.
- `M83` switches to relative extrusion mode.
- `G0` and `G1` are movement commands.
- Positive extrusion with XY motion is an `extrude_move`.
- XY motion without positive extrusion is a `travel_move`.
- Negative extrusion is `retract`.
- Positive extrusion without XY after a retract is `prime`.
- Z-only movement is a `layer_change`.
- Semicolon comments are preserved.

## Feedrate Rule

Only `extrude_move` lines may receive the target print feedrate.

```text
target F = print_speed_mm_s * 60
```

All retraction, prime, travel and layer-change feedrates remain unchanged.
