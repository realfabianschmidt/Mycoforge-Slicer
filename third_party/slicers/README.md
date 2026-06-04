# Managed Slicers

Mycoforge Studio can manage external slicer tools here.

OrcaSlicer binaries downloaded by the CLI are stored under:

```text
third_party/slicers/orca/<version>/
```

That directory is intentionally ignored by git. Mycoforge stays a separate app
and does not vendor OrcaSlicer source or binaries into the repository.

Runtime configuration is stored in a local `manifest.json` that is generated on
demand and ignored by git. See `manifest.example.json` for the default shape.
