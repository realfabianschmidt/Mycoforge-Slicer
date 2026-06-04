"""Small validation helpers shared by CLI commands."""

from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse


def require_existing_file(path: str | Path, label: str = "file") -> Path:
    resolved = Path(path)
    if not resolved.is_file():
        raise FileNotFoundError(f"{label} does not exist: {resolved}")
    return resolved


def require_parent_dir(path: str | Path) -> Path:
    resolved = Path(path)
    resolved.parent.mkdir(parents=True, exist_ok=True)
    return resolved


def normalize_base_url(base_url: str) -> str:
    parsed = urlparse(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError(f"Moonraker URL must include scheme and host: {base_url}")
    return base_url.rstrip("/")
