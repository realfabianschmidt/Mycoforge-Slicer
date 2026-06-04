# Architecture

Mycoforge Studio is split into a tested CLI core and a thin desktop shell.

```text
Desktop UI
-> Tauri Rust command
-> Python CLI subprocess
-> managed OrcaSlicer / parser / normalizer / retraction translator / Moonraker client
```

The CLI is the contract. Any future OrcaSlicer fork, PrusaSlicer
post-processing script, or desktop workflow should call the same pipeline.

## Components

- `mycoforge_cli.main`: Typer command surface.
- `gcode_parser`: stateful line parser for movement and extrusion semantics.
- `flow_normalizer`: feedrate rewrite for extrusion moves only.
- `retraction_translator`: annotate or replace slicer retraction commands.
- `moonraker_client`: HTTP client for connection tests, status and upload.
- `slicer_runner`: optional external slicer CLI integration.
- `slicer_manager`: managed external OrcaSlicer download, custom slicer path
  registration and slicer resolution.
- Desktop preview: React component backed by `gcode-viewer`, rendering the
  final processed G-code with layer slicing, travel/extrusion toggles, feedrate
  colors and Mycoforge retract/prime markers.

## Slicer Boundary

OrcaSlicer is treated as an external tool. Managed downloads are stored in
`third_party/slicers/orca/<version>/`, which is ignored by git. This keeps the
Mycoforge app separate from an OrcaSlicer source fork and avoids committing
large platform-specific binaries.

## Final G-Code Preview

The app previews only the final Mycoforge output path. The flow is:

```text
STL/3MF
-> OrcaSlicer CLI raw G-code
-> Mycoforge postprocessing
-> Preview
-> Upload / Print
```

Raw slicer G-code is an intermediate artifact and is not what the user should
inspect before printing.
