# Mycoforge Nozzle Workflow

The printer stores the mounted nozzle because the physical nozzle is a hardware
state, not a slicer preference. Mycoforge treats Klipper/Moonraker as the source
of truth before slicing and writes the selected nozzle into the generated G-code.

## Why Query Before Slicing

Nozzle diameter changes slicer geometry: line width, layer height limits,
volumetric flow limits, speeds, and paste pressure behavior. Post-processing
cannot safely repair those geometric decisions after OrcaSlicer has already
planned the paths. Post-processing may validate metadata, but it must not claim
to fix a wrongly sliced nozzle.

The nozzle is not part of the PCP or piston `rotation_distance`. Those values
come from the virtual filament reference, pump geometry, cartridge area, screw
lead, gear ratio, and calibration factors.

## Operator Flow

1. Change the nozzle mechanically.
2. In Mainsail or Fluidd, set the printer state:

   ```gcode
   SET_MYCO_NOZZLE DIAMETER=6.0
   ```

3. Verify the state:

   ```gcode
   GET_MYCO_NOZZLE
   ```

   Expected response:

   ```text
   MYCO_NOZZLE DIAMETER=6.0
   ```

4. Slice through Mycoforge with printer nozzle sync enabled, or run:

   ```bash
   python tools/mycoforge_nozzle_query.py --moonraker-url http://192.168.1.42:7125
   python tools/mycoforge_orca_prepare.py --moonraker-url http://192.168.1.42:7125 --profiles-dir profiles/slicer/orca --mode info
   ```

5. Generated G-code must contain:

   ```gcode
   START_PRINT NOZZLE=<slicer_nozzle> LAYER_HEIGHT=<layer_height> LINE_WIDTH=<line_width> E_RATE=<virtual_e_rate>
   ```

6. At print start, Klipper compares the slicer nozzle against `MYCO_STATE`.
   A mismatch aborts before extrusion.

## Orca Placeholder

For Mycoforge-generated G-code, the CLI writes `START_PRINT` directly and does
not depend on an Orca placeholder. If this is configured manually inside Orca,
test the exact placeholder with OrcaSlicer before production use. Orca/Slic3r
profiles often expose nozzle diameter as an extruder-indexed value such as a
nozzle array; do not add an untested placeholder to production start G-code.

## Failure Messages

`Slicer nozzle X does not match printer nozzle Y. Set printer nozzle or reslice.`
: The mounted nozzle in Klipper differs from the G-code. Run `SET_MYCO_NOZZLE`
or reslice with the correct printer state.

`Moonraker nozzle query failed`
: The slicer cannot reach Moonraker. Check the Moonraker URL, network, and
Klipper status.

`No Orca nozzle profile mapping`
: `profiles/slicer/orca/nozzle_profiles.json` has no entry for the printer
nozzle.

`START_PRINT is missing required NOZZLE`
: The G-code cannot be validated. Regenerate it through Mycoforge or fix the
start G-code template.

## Calibration

Do not change PCP or piston `rotation_distance` per nozzle. Calibrate
`pcp_calibration_factor` and `piston_calibration_factor` for the pump/cartridge
setup and material behavior. Nozzle-specific profiles should adjust layer
height, line width, speeds, volumetric limits, prime/retract, and pressure
behavior only.

The current production Klipper setup uses the custom `[myco_piston piston]`
module for M4 piston control. It exposes the piston to Klipper's
`SYNC_EXTRUDER_MOTION` path so PCP and piston can share the extruder motion
queue during prime and print moves.

The piston is desynchronized during homing, reservoir positioning, idle
operation, and recovery. If paste sync appears to block later commands, use
`MYCO_SYNC_RECOVER`; it intentionally avoids `M400` so it does not wait behind
the same stuck motion queue. A disabled `manual_stepper` fallback remains in the
Klipper workspace for bench recovery, but it must not be enabled at the same
time as `[myco_piston piston]` because both configurations own the same M4 pins.
