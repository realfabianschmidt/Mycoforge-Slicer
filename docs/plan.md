# Mycoforge Studio MVP-Plan

## Zielbild

Mycoforge Studio kombiniert Slicer, G-Code-Postprocessing und Moonraker-Upload
in einer einfachen Desktop-Oberflaeche. Der Nutzer soll nur Modell oder G-Code
waehlen, Material und Druckparameter einstellen, slicen oder verarbeiten und
danach senden oder direkt starten.

```text
STL/3MF
-> Managed OrcaSlicer CLI
-> Mycoforge G-Code Normalizer
-> Retraction Translator
-> final G-Code Preview
-> Klipper/Moonraker Upload
-> optional Print Start
```

Fuer den MVP wird kein OrcaSlicer-Fork gebaut. Die erste Version besteht aus
einer Python-CLI mit klar getesteter G-Code-Logik und einer Tauri/React-UI-Shell.

## MVP-Scope

- Python CLI fuer Slicer-Verwaltung, Normalisierung, Retraction-Uebersetzung,
  Profilverarbeitung und Moonraker-Upload.
- Tauri/React Desktop-Shell, die die Python-CLI als Subprozess startet.
- Integrierte G-Code-Preview fuer den finalen Mycoforge-G-Code.
- Profile fuer Mycoforge-Materialien, Drucker und Slicer-Binary-Konfiguration.
- Tests fuer Parser, Flow-Normalizer, Retraction-Translator und Moonraker-Client.
- Noch kein OrcaSlicer-Fork und kein gebundeltes Slicer-Binary.

## Repo-Struktur

```text
mycoforge-studio/
├─ apps/desktop/              # Tauri + React + TypeScript UI shell
├─ tools/mycoforge_cli/       # Python CLI and core pipeline
├─ profiles/                  # material, printer, slicer profiles
├─ tests/                     # pytest tests and G-code fixtures
├─ docs/                      # architecture and setup documents
├─ README.md
└─ pyproject.toml
```

## Meilensteine

1. CLI-Grundlage: Projektstruktur, Typer-Commands, Profile laden, Dateien lesen
   und schreiben.
2. G-Code Parser: `G0/G1`, `X/Y/Z/E/F`, Kommentare, `M82`, `M83`, Extrusion,
   Travel, Retract, Prime und Layerwechsel erkennen.
3. Flow Normalizer: Nur echte Extrusionsbewegungen auf Zielgeschwindigkeit
   setzen. Retraction, Prime, Travel und Layerwechsel bleiben unveraendert.
4. Retraction Translator: MVP-Default `annotate_only`; optional
   `macro_translate` fuer spaetere Klipper-Macros.
5. Moonraker Client: `/server/info` testen und G-Code per
   `POST /server/files/upload` mit `root=gcodes` senden; `print=true` nur bei
   explizitem Printstart.
6. Managed OrcaSlicer: `mycoforge slicer install-orca`, Custom-Pfad und
   `slice-process` fuer Roh-Slice plus finalen Mycoforge-G-Code.
7. Desktop UI: Datei, Material, Druckparameter, Retraction-Staerke,
   Moonraker-URL, CLI-Logs und Buttons fuer Slice, Process, Send und Print.
8. G-Code Preview: Layer-Slider, Extrusion/Travel/Retraction-Toggles,
   Feedrate-Farben, Statistiken und Warnungen fuer kurze Extrusionssegmente.

## Technische Grundregel

Der Postprocessor darf nicht alle `F`-Werte ersetzen. Nur echte
Extrusionsbewegungen bekommen eine konstante Druckgeschwindigkeit.

Unveraendert bleiben:

- Retraction
- Prime / Deretraction
- Travel
- Z-only Layerwechsel
- Kommentare und Slicer-Metadaten

Die Preview laeuft auf dem finalen Output, der auch an Moonraker gesendet wird.
Der rohe Slicer-Output ist nur ein Zwischenschritt.

## Externe Grundlagen

- Moonraker File Upload nutzt `POST /server/files/upload`, `root=gcodes` und
  optional `print=true`: <https://moonraker.readthedocs.io/en/latest/external_api/file_manager/>
- Fluidd beschreibt Slicer-Uploads ueber Moonrakers OctoPrint-Kompatibilitaet
  mit `[octoprint_compat]`: <https://docs.fluidd.xyz/features/slicer-uploads/>
- PrusaSlicer Postprocessing-Skripte erhalten eine temporaere G-Code-Datei und
  bearbeiten diese in place: <https://help.prusa3d.com/article/post-processing-scripts_283913>
- OrcaSlicer ist AGPL-3.0 und bleibt wegen Groesse und Lizenz eine spaetere
  Fork-Option: <https://github.com/OrcaSlicer/OrcaSlicer>
- `gcode-viewer` ist MIT-lizenziert und wird fuer die integrierte
  G-Code-Linienansicht genutzt: <https://github.com/aligator/gcode-viewer>

## Lokale Voraussetzung

Vor einer vollstaendigen Ausfuehrung muss Python 3.11+ installiert oder der
PATH repariert werden. In der aktuellen Shell ist `python.exe` nur als
Microsoft-Store-App-Alias sichtbar und nicht nutzbar.
