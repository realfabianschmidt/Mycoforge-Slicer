"""Managed external slicer installation for Mycoforge Studio."""

from __future__ import annotations

from dataclasses import dataclass
import json
import os
from pathlib import Path
import shutil
import tempfile
from typing import Any
from urllib.parse import urlparse
import zipfile

import requests
from requests import RequestException

from .validators import require_existing_file


GITHUB_RELEASES_API = "https://api.github.com/repos/OrcaSlicer/OrcaSlicer/releases"
SCHEMA_VERSION = 1


class SlicerManagerError(RuntimeError):
    pass


@dataclass(frozen=True)
class SlicerResolution:
    state: str
    source: str | None
    path: Path | None
    version: str | None = None
    name: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "state": self.state,
            "source": self.source,
            "path": str(self.path) if self.path else None,
            "version": self.version,
            "name": self.name,
        }


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def slicer_home(root: Path | None = None) -> Path:
    return (root or project_root()) / "third_party" / "slicers"


def manifest_path(root: Path | None = None) -> Path:
    return slicer_home(root) / "manifest.json"


def default_manifest() -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "custom_slicer_path": None,
        "managed": {"orca": None},
    }


def load_manifest(root: Path | None = None) -> dict[str, Any]:
    path = manifest_path(root)
    if not path.exists():
        return default_manifest()
    with path.open("r", encoding="utf-8") as handle:
        manifest = json.load(handle)
    if not isinstance(manifest, dict):
        raise SlicerManagerError(f"Slicer manifest must contain a JSON object: {path}")
    manifest.setdefault("schema_version", SCHEMA_VERSION)
    manifest.setdefault("custom_slicer_path", None)
    manifest.setdefault("managed", {}).setdefault("orca", None)
    return manifest


def save_manifest(manifest: dict[str, Any], root: Path | None = None) -> None:
    home = slicer_home(root)
    home.mkdir(parents=True, exist_ok=True)
    with manifest_path(root).open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2, sort_keys=True)
        handle.write("\n")


def set_custom_slicer(path: str | Path, root: Path | None = None) -> dict[str, Any]:
    binary = require_existing_file(path, "slicer binary").resolve()
    manifest = load_manifest(root)
    manifest["custom_slicer_path"] = str(binary)
    save_manifest(manifest, root)
    return slicer_status(root)


def resolve_slicer(root: Path | None = None) -> SlicerResolution:
    manifest = load_manifest(root)

    custom_path = manifest.get("custom_slicer_path")
    if custom_path:
        custom = Path(str(custom_path))
        if custom.is_file():
            return SlicerResolution("custom", "custom", custom, name=custom.name)

    managed = manifest.get("managed", {}).get("orca")
    if isinstance(managed, dict):
        binary_path = managed.get("binary_path")
        if binary_path:
            binary = Path(str(binary_path))
            if binary.is_file():
                return SlicerResolution(
                    state="installed",
                    source="orca",
                    path=binary,
                    version=str(managed.get("version") or ""),
                    name=binary.name,
                )

    return SlicerResolution("missing", None, None)


def resolve_slicer_path(root: Path | None = None) -> Path:
    resolved = resolve_slicer(root)
    if resolved.path is None:
        raise SlicerManagerError(
            "No slicer is configured. Run `mycoforge slicer install-orca` or `mycoforge slicer set-custom --path <exe>`."
        )
    return resolved.path


def slicer_status(root: Path | None = None) -> dict[str, Any]:
    resolved = resolve_slicer(root)
    manifest = load_manifest(root)
    return {
        "ok": resolved.path is not None,
        "resolution": resolved.as_dict(),
        "manifest_path": str(manifest_path(root)),
        "configured": manifest,
    }


def install_orca(version: str = "latest", root: Path | None = None) -> dict[str, Any]:
    release = fetch_orca_release(version)
    asset = select_windows_orca_asset(release.get("assets", []))

    tag = str(release.get("tag_name") or version)
    install_root = slicer_home(root) / "orca" / sanitize_version(tag)
    downloads = slicer_home(root) / "downloads"
    install_root.mkdir(parents=True, exist_ok=True)
    downloads.mkdir(parents=True, exist_ok=True)

    archive_path = downloads / asset["name"]
    download_file(asset["browser_download_url"], archive_path)

    if install_root.exists():
        shutil.rmtree(install_root)
    install_root.mkdir(parents=True, exist_ok=True)
    extract_zip_safe(archive_path, install_root)
    binary = find_orca_binary(install_root)

    manifest = load_manifest(root)
    manifest.setdefault("managed", {})["orca"] = {
        "version": tag,
        "binary_path": str(binary),
        "install_dir": str(install_root),
        "asset_name": asset["name"],
        "release_url": release.get("html_url"),
    }
    save_manifest(manifest, root)

    return {
        "ok": True,
        "version": tag,
        "asset": asset["name"],
        "binary_path": str(binary),
        "install_dir": str(install_root),
        "release_url": release.get("html_url"),
    }


def fetch_orca_release(version: str = "latest") -> dict[str, Any]:
    url = f"{GITHUB_RELEASES_API}/latest" if version == "latest" else f"{GITHUB_RELEASES_API}/tags/{version}"
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        payload = response.json()
    except RequestException as exc:
        raise SlicerManagerError(f"Could not fetch OrcaSlicer release metadata: {exc}") from exc
    except ValueError as exc:
        raise SlicerManagerError("GitHub release response was not valid JSON.") from exc
    if not isinstance(payload, dict):
        raise SlicerManagerError("GitHub release response was not an object.")
    return payload


def select_windows_orca_asset(assets: list[dict[str, Any]]) -> dict[str, str]:
    candidates: list[dict[str, Any]] = []
    rejected_names: list[str] = []

    for asset in assets:
        name = str(asset.get("name") or "")
        url = str(asset.get("browser_download_url") or "")
        lower = name.lower()
        rejected_names.append(name)
        if not name or not url:
            continue
        if not lower.endswith(".zip"):
            continue
        if any(token in lower for token in ["mac", "linux", "ubuntu", "debian", "arm", "aarch"]):
            continue
        if any(token in lower for token in ["windows", "win64", "win", "x64"]):
            candidates.append({"name": name, "browser_download_url": url})

    if not candidates:
        raise SlicerManagerError(
            "No Windows OrcaSlicer zip asset found. Release assets: " + ", ".join(rejected_names)
        )

    candidates.sort(key=lambda item: _asset_score(item["name"]), reverse=True)
    return candidates[0]


def download_file(url: str, destination: Path) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise SlicerManagerError(f"Unsupported download URL: {url}")

    fd, tmp_name = tempfile.mkstemp(prefix="orca-", suffix=".download", dir=destination.parent)
    os.close(fd)
    tmp = Path(tmp_name)
    try:
        with requests.get(url, stream=True, timeout=120) as response:
            response.raise_for_status()
            with tmp.open("wb") as handle:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        handle.write(chunk)
        tmp.replace(destination)
    except RequestException as exc:
        raise SlicerManagerError(f"Could not download OrcaSlicer asset: {exc}") from exc
    finally:
        if tmp.exists():
            tmp.unlink()


def extract_zip_safe(archive_path: Path, destination: Path) -> None:
    with zipfile.ZipFile(archive_path) as archive:
        destination_resolved = destination.resolve()
        for member in archive.infolist():
            target = (destination / member.filename).resolve()
            if destination_resolved not in target.parents and target != destination_resolved:
                raise SlicerManagerError(f"Unsafe path in OrcaSlicer archive: {member.filename}")
        archive.extractall(destination)


def find_orca_binary(install_root: Path) -> Path:
    preferred = ["orcaslicer.exe", "orca-slicer.exe", "orca_slicer.exe"]
    executables = [path for path in install_root.rglob("*.exe") if path.is_file()]

    for name in preferred:
        for executable in executables:
            if executable.name.lower() == name:
                return executable

    for executable in executables:
        if "orca" in executable.name.lower() and "slicer" in executable.name.lower():
            return executable

    raise SlicerManagerError(f"No OrcaSlicer executable found under {install_root}")


def sanitize_version(version: str) -> str:
    return "".join(char if char.isalnum() or char in ".-_" else "_" for char in version)


def _asset_score(name: str) -> int:
    lower = name.lower()
    score = 0
    if "windows" in lower:
        score += 5
    if "win64" in lower or "x64" in lower:
        score += 4
    if "portable" in lower:
        score += 3
    if "orca" in lower:
        score += 2
    return score
