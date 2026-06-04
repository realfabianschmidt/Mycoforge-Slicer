# Mycoforge Changelog

Approximate project change log reconstructed from the active slicer and Klipper workspaces.

## ca. 2026-05-21

- Fixed OrcaSlicer CLI invocation for managed Orca 2.3.2.
- Added built-in Mycoforge Orca machine/process/filament profile set.
- Added nozzle workflow tooling and `START_PRINT` nozzle validation.

## 2026-05-24

- Organized the Klipper workspace and made `printer_data/config`, `klippy_extras`, and `ui` the active source locations.
- Archived the last known pre-queue-sync working config under `archive/legacy-working/2026-05-24-pre-queue-sync`.

## 2026-05-25

- Migrated the paste workflow from cartridge wording to reservoir workflow.
- Added the custom `[myco_piston piston]` Klipper extra and queue-sync path for PCP/Piston coordination.
- Added the dedicated Reservoir UI panel and updated kiosk navigation.

## 2026-05-26

- Added printer-control workspace and printer settings/discovery in the slicer shell.
- Hardened queue-sync recovery: drip flushing now restores background flushing, piston states are explicit, recovery commands avoid `M400`, and `MYCO_PRIME` desynchronizes after priming.
- Added UI pending-command visibility and Paste Sync Recover controls.
