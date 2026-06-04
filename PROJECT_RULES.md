# Mycoforge Project Rules

These rules keep Mycoforge Studio readable and safe for paste-printing work.

## Language

- Active developer documentation, code comments, and implementation plans are written in English.
- User-facing UI text may use the language that fits the operator workflow.
- Technical units are always explicit: mm, mm/s, mm^2, mm^3/s, ml.

## Code Shape

- Keep UI handlers thin. Rendering components call small helpers or services for geometry, profiles, G-code, and printer communication.
- Keep hardware-specific behavior in explicit adapters or profile helpers. Do not hide printer assumptions in generic utilities.
- Prefer clear names over abbreviations. If an abbreviation is required, explain it near the first use.
- Do not add dynamic plugin loading or installable third-party plugin architecture without a concrete product need.

## Paste Printing Safety

- Generated G-code must not silently emit unknown printer commands.
- Any Mycoforge-specific command must be guarded by an explicit macro contract. The default contract is comment-only metadata.
- Material and machine profiles must declare units and paste-relevant values such as nozzle diameter, virtual E area, max volumetric flow, and pressure/retraction behavior.
- Slicer output must include enough metadata to reproduce the run: material id, line width, layer height, speed, volume flow, virtual E rate, and profile contract.
- Object bounds and printer volume violations must be visible before slicing and must block slicing.

## Verification

- Every material/profile behavior change needs a focused unit test or golden-file check.
- Every generated G-code command that targets Klipper must be covered by a test or documented macro contract.
- If a manual printer check could not be performed, say so clearly in the handoff.
