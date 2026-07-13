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
mycoforge slicer install-orca --version v2.3.2
mycoforge slice-process model.stl --out mycoforge_ready.gcode --profile profiles/materials/mycelium_default.json
mycoforge upload mycoforge_ready.gcode --moonraker http://192.168.1.42:7125
mycoforge print mycoforge_ready.gcode --moonraker http://192.168.1.42:7125
```

Managed OrcaSlicer installs are stored under `third_party/slicers/orca/` and
are ignored by git. Local source checkouts do not commit OrcaSlicer binaries.

Installed desktop builds store managed OrcaSlicer state in the app-local data
directory instead, so the installation directory can stay read-only. Release
installers bundle OrcaSlicer `v2.3.2` as a separate third-party AGPL-3.0 tool
and copy it into that writable cache when `Install Orca` is used.

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

## Releases

Windows releases are published from `main` by pushing an `app-v<version>` tag.
The local helper bumps all app version files, runs checks, commits the version
change, pushes `main`, and pushes the release tag:

```powershell
.\release.ps1 patch
```

Preview the next version without changing files, commits, tags, or releases:

```powershell
.\release.ps1 patch -DryRun
```

If local PowerShell policy blocks `.ps1` files, use the same wrapper with an
explicit process-local bypass:

```powershell
powershell -ExecutionPolicy Bypass -File .\release.ps1 patch -DryRun
```

Run the full local Tauri installer build before pushing the tag:

```powershell
.\release.ps1 patch -FullChecks
```

After the tag is pushed, GitHub Actions downloads the pinned OrcaSlicer
portable ZIP, verifies its SHA-256 digest, bundles it into the unsigned Windows
NSIS setup EXE, and publishes the installer on:

```text
https://github.com/realfabianschmidt/Mycoforge-Slicer/releases/tag/app-v<version>
```

The installer bundles the Mycoforge `tools/`, `profiles/`, `klipper/`, docs,
and OrcaSlicer `v2.3.2` resources. OrcaSlicer is redistributed as a separate
AGPL-3.0 third-party executable; see `vendor/orca/THIRD_PARTY_NOTICES.md`.
Python 3.11+ and the Python package dependencies are still expected on the
target machine for this first release flow.
