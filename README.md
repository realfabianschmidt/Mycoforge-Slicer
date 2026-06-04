# Mycoforge Studio

Mycoforge Studio is an MVP desktop workflow for paste and mycelium printing.

The first usable pipeline is:

```text
STL/3MF or raw G-code
-> managed OrcaSlicer CLI or existing G-code
-> Mycoforge G-code postprocessing
-> final G-code preview
-> Moonraker upload
-> optional print start
```

The core logic lives in the Python CLI. The Tauri/React app is a shell around
the same CLI and renders the final processed G-code with `gcode-viewer`.

## Local Prerequisites

- Python 3.11 or newer must be installed and available on PATH.
- Node.js and npm are required for the desktop UI.
- Rust and Cargo are required for Tauri.
- OrcaSlicer can be installed as a managed external tool, or a custom slicer
  binary can be configured.

On this machine, `node`, `npm.cmd`, and `cargo` were detected. Python still
needs a real interpreter installation or a fixed PATH because the current
`python.exe` points to a Microsoft Store app alias.

## CLI Examples

```bash
mycoforge normalize-gcode raw.gcode --out normalized.gcode --speed 15
mycoforge translate-retraction normalized.gcode --out annotated.gcode --mode annotate_only
mycoforge process-gcode raw.gcode --out mycoforge_ready.gcode --profile profiles/materials/mycelium_default.json
mycoforge slicer status
mycoforge slicer install-orca --version latest
mycoforge slice-process model.stl --out mycoforge_ready.gcode --profile profiles/materials/mycelium_default.json
mycoforge upload mycoforge_ready.gcode --moonraker http://192.168.1.42:7125
mycoforge print mycoforge_ready.gcode --moonraker http://192.168.1.42:7125
```

Managed OrcaSlicer downloads are stored under `third_party/slicers/orca/` and
are ignored by git. Mycoforge Studio does not vendor OrcaSlicer source or
binaries into this repository.

During development, without installing the package:

```bash
PYTHONPATH=tools python -m mycoforge_cli.main process-gcode raw.gcode --out mycoforge_ready.gcode --profile profiles/materials/mycelium_default.json
```

PowerShell equivalent:

```powershell
$env:PYTHONPATH = "tools"
python -m mycoforge_cli.main process-gcode raw.gcode --out mycoforge_ready.gcode --profile profiles/materials/mycelium_default.json
```

## Desktop App

```bash
cd apps/desktop
npm.cmd install
npm.cmd run tauri:dev
```

The desktop app invokes the Python CLI. If Python is not available, the UI will
show the subprocess error in its console panel.

The Tauri dev server uses <http://127.0.0.1:1437>. If that port is occupied,
free it or change both `apps/desktop/vite.config.ts` and
`apps/desktop/src-tauri/tauri.conf.json` to the same port.

The Preview panel loads the final processed G-code path, not the raw slicer
output. Slice now runs `slice-process`, which produces raw slicer G-code first
and then writes the Mycoforge-ready output used by preview, upload and print.

## Tests

```bash
cd apps/desktop
npm.cmd test
npm.cmd run build
```

Python tests require a working Python interpreter on PATH:

```bash
pytest
```
