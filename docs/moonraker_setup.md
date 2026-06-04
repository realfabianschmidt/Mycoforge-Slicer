# Moonraker Setup

The MVP uses Moonraker's HTTP API directly.

## Connection Test

The CLI checks:

```text
GET /server/info
```

## Upload

The CLI uploads G-code through multipart form data:

```text
POST /server/files/upload
root=gcodes
print=false
```

For direct print start:

```text
print=true
```

`print=true` is only sent for the explicit `print` command or the UI's
`Print Now` action.

## Slicer Compatibility

Some slicers can upload through Moonraker's OctoPrint compatibility layer if
`[octoprint_compat]` is enabled in `moonraker.conf`. Mycoforge Studio does not
depend on that path for its own upload command.
