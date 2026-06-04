# Pastendruck Findings und Start-Gate

Stand: 2026-05-27

## Druckstart-Gate

Der Druckstart sollte nicht allein durch den Moonraker-Upload mit `print=true`
ausgelöst werden. Moonraker startet einen Upload mit `print=true` nach
erfolgreichem Upload direkt als Print Job. Deshalb muss der Client vor diesem
Upload eine Statusabfrage machen.

Die passende Schnittstelle ist Moonrakers
`/printer/objects/query`. Sie kann Klipper-Objekte wie `print_stats`,
`virtual_sdcard`, `pause_resume` und `gcode_macro MYCO_STATE` in einer Abfrage
liefern. Klipper stellt Makro-Variablen als `gcode_macro <name>` Statusobjekte
bereit.

Startbedingungen fuer Mycoforge:

- Klipper meldet `ready`.
- `print_stats.state` ist `standby`, `complete` oder `cancelled`.
- `pause_resume.is_paused` ist nicht aktiv.
- `virtual_sdcard.is_active` ist nicht aktiv.
- `gcode_macro MYCO_STATE.piston_homed == 1`.
- `gcode_macro MYCO_STATE.reservoir_ready == 1`.
- `gcode_macro MYCO_STATE.material_primed == 1`.
- `gcode_macro MYCO_STATE.reservoir_empty != 1`.
- `gcode_macro START_PRINT.state` ist `Prepare`, sofern diese Variable gemeldet wird.

`sync_mode=off` ist vor dem Start erlaubt. Nach dem Priming schaltet
`MYCO_PRIME` den Sync wieder ab; `START_PRINT` aktiviert den Print-Sync erneut.

## Befund zur aktiven Klipper-Konfiguration

Read-only geprüft wurde:

`H:\VisionVault\01_Projekte\24_CodedNature\Scripte\Mycoforge_Klipper\printer_data\config`

Die aktive Konfiguration enthält bereits die zentrale Sicherheitslogik:

- `printer.cfg` bindet `paste_macros.cfg` und `myco_state.cfg` ein.
- `MYCO_STATE` exponiert Homing-, Reservoir-, Priming- und Sync-Status.
- `MYCO_PRIME` setzt `material_primed=1` erst nach synchronisiertem Prime.
- `START_PRINT` blockiert bei fehlendem Piston-Homing, fehlender Reservoir-Bereitschaft, fehlendem Priming, leerem Reservoir und unpassenden Nozzle-/Layer-/Line-Parametern.
- `RESUME` prüft Reservoir- und Priming-Zustand erneut.
- `END_PRINT` und `CANCEL_PRINT` setzen `material_primed=0`.

Fuer andere Deployments muessen mindestens diese Klipper-Bausteine vorhanden
sein:

- `[include myco_state.cfg]`
- `[include paste_macros.cfg]`
- `[save_variables]`
- `[respond]`
- `[pause_resume]`
- `[virtual_sdcard]`
- `MYCO_STATE` mit `piston_homed`, `reservoir_ready`, `material_primed`, `reservoir_empty`, `sync_mode`
- `START_PRINT` mit `action_raise_error` fuer alle nicht sicheren Startzustaende

Optional sinnvoll ist ein physischer Reservoir- oder Empty-Sensor, der
`reservoir_empty` setzt. Klipper kann Sensorzustaende ueber
`filament_switch_sensor` oder aehnliche Statusobjekte melden; die vorhandene
Piston-Positionslogik kann ebenfalls als Empty-Heuristik genutzt werden.

## Pastendruck-Toolpaths

Direct Ink Writing und andere Pastendruck-Prozesse sind empfindlicher gegen
Start/Stop-Fehler als FDM. Die Quellenlage ist konsistent: Pasten brauchen eine
enge Kopplung von Volumenstrom, Linienquerschnitt, Schichthoehe und
Verfahrgeschwindigkeit. Kurze Segmente, viele Retracts und lange
Nicht-Extrusionsfahrten erzeugen leicht Druckspitzen, Nachlaufen, Blobbildung
und ungleichmaessige Raupen.

Sinnvolle Defaults fuer Mycoforge:

- Linienbreite nahe Nozzle-Durchmesser starten.
- Schichthoehe konservativ unter Linienbreite halten.
- Travel-Speed separat regelbar machen.
- Kleine Gap-Fill-/Splittersegmente filtern.
- Fuer schalenartige Koerper Vase Mode bevorzugen.
- Infill, Wandanzahl und Top/Bottom-Layer explizit steuerbar machen.

## Slicer-Mapping

OrcaSlicer unterstuetzt die relevanten Parameter direkt in Process-Profilen:

- `spiral_mode`
- `spiral_mode_smooth`
- `wall_loops`
- `top_shell_layers`
- `bottom_shell_layers`
- `sparse_infill_density`
- `enable_support`
- `travel_speed`
- `filter_out_gap_fill`
- Linienbreiten und Feature-Geschwindigkeiten

Mycoforge setzt fuer Vase Mode:

- `spiral_mode=1`
- `spiral_mode_smooth=1`, falls Smooth Vase aktiv ist
- `wall_loops=1`
- `top_shell_layers=0`
- `sparse_infill_density=0%`
- `enable_support=0`
- `bottom_shell_layers=1` als Default fuer einen geschlossenen Boden

Fuer Standard-Pastendruck bleiben die Defaults:

- `wallLoops=3`
- `topShellLayers=3`
- `bottomShellLayers=3`
- `infillDensityPercent=15`
- `travelSpeedMmS` aus Materialprofil, Fallback `80`

## Kurze Extrusionsstrecken

Orcas `filter_out_gap_fill` entfernt nur bestimmte Gap-Fill-Faelle. Fuer
Pastendruck reicht das nicht, weil auch sehr kurze positive XY-Extrusionen aus
Perimetern oder Infill problematisch sein koennen.

Mycoforge ergaenzt deshalb einen G-Code-Postprocessor:

- Default aktiv.
- Mindestlaenge: `max(5.0 mm, lineWidthMm * 1.5)`, also `7.5 mm` beim 5-mm-Profil.
- Nur positive XY-Extrusionsmoves unterhalb der Mindestlaenge werden gefiltert.
- Der Toolhead-Move bleibt erhalten, aber ohne `E`, damit die Position stimmt.
- Absolute E-Werte werden danach rebased, damit die entfernte Materialmenge nicht im naechsten Segment nachgeholt wird.
- Prime-/Retract-only-Moves bleiben erhalten.
- G2/G3-Arcs werden nicht als kurze Segmente gefiltert.
- Der G-Code-Header dokumentiert Filterstatus, Grenzwert, Anzahl und entfernte E-Menge.

## Quellen

- Moonraker Printer API: https://moonraker.readthedocs.io/en/latest/external_api/printer/
- Moonraker File Upload API: https://moonraker.readthedocs.io/en/latest/external_api/file_manager/
- Klipper Command Templates: https://www.klipper3d.org/Command_Templates.html
- Klipper Status Reference: https://www.klipper3d.org/Status_Reference.html
- Klipper G-Codes: https://www.klipper3d.org/G-Codes.html
- OrcaSlicer Special Mode: https://www.orcaslicer.com/wiki/print_settings/others/others_settings_special_mode
- OrcaSlicer Infill and Gap Filter: https://www.orcaslicer.com/wiki/print_settings/strength/strength_settings_infill
- OrcaSlicer Line Width: https://www.orcaslicer.com/wiki/print_settings/quality/quality_settings_line_width
- Additive Manufacturing of Ceramic Materials via DIW: https://www.mdpi.com/2571-6131/9/2/16
- Rheology and printability for DIW: https://www.sciencedirect.com/science/article/pii/S0079642523001202
- Toolpath Planning for Continuous Extrusion AM: https://research.engr.oregonstate.edu/rdml/sites/research.engr.oregonstate.edu.rdml/files/toolpath-planning-continuous-final.pdf
