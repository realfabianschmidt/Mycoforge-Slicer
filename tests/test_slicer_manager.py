from __future__ import annotations

from io import BytesIO
import json
from pathlib import Path
import zipfile

from mycoforge_cli import slicer_manager


def test_select_windows_orca_asset_prefers_portable_windows_zip():
    asset = slicer_manager.select_windows_orca_asset(
        [
            {"name": "OrcaSlicer_Linux.AppImage", "browser_download_url": "https://example.invalid/linux"},
            {"name": "OrcaSlicer_Windows_x64_portable.zip", "browser_download_url": "https://example.invalid/win"},
            {"name": "OrcaSlicer_Mac.zip", "browser_download_url": "https://example.invalid/mac"},
        ]
    )

    assert asset["name"] == "OrcaSlicer_Windows_x64_portable.zip"


def test_set_custom_slicer_resolves_custom_binary(tmp_path):
    binary = tmp_path / "OrcaSlicer.exe"
    binary.write_text("fake", encoding="utf-8")

    status = slicer_manager.set_custom_slicer(binary, root=tmp_path)

    assert status["ok"] is True
    assert status["resolution"]["state"] == "custom"
    assert status["resolution"]["path"] == str(binary.resolve())


def test_slicer_home_can_use_installed_app_cache(monkeypatch, tmp_path):
    cache = tmp_path / "app-cache"
    explicit_root = tmp_path / "repo-root"

    monkeypatch.setenv("MYCOFORGE_SLICER_HOME", str(cache))

    assert slicer_manager.slicer_home() == cache
    assert slicer_manager.slicer_home(root=explicit_root) == explicit_root / "third_party" / "slicers"


def test_install_orca_uses_bundled_vendor_before_download(monkeypatch, tmp_path):
    vendor_root = tmp_path / "vendor" / "orca"
    bundled_binary = vendor_root / "win-x64" / "v2.3.2" / "OrcaSlicer" / "OrcaSlicer.exe"
    bundled_binary.parent.mkdir(parents=True)
    bundled_binary.write_text("fake exe", encoding="utf-8")
    (vendor_root / "manifest.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "version": "v2.3.2",
                "asset_name": "OrcaSlicer_Windows_V2.3.2_portable.zip",
                "install_dir": "win-x64/v2.3.2",
                "binary_path": "win-x64/v2.3.2/OrcaSlicer/OrcaSlicer.exe",
                "release_url": "https://github.com/OrcaSlicer/OrcaSlicer/releases/tag/v2.3.2",
                "source_url": "https://github.com/OrcaSlicer/OrcaSlicer/tree/v2.3.2",
                "license": "AGPL-3.0-only",
            }
        ),
        encoding="utf-8",
    )

    def fail_get(*args, **kwargs):
        raise AssertionError("Bundled OrcaSlicer should not hit the network")

    monkeypatch.setattr(slicer_manager.requests, "get", fail_get)

    result = slicer_manager.install_orca(root=tmp_path)
    status = slicer_manager.slicer_status(root=tmp_path)

    assert result["ok"] is True
    assert result["source"] == "bundled"
    assert result["version"] == "v2.3.2"
    assert Path(result["binary_path"]).is_file()
    assert status["resolution"]["state"] == "installed"
    assert status["configured"]["managed"]["orca"]["distribution"] == "bundled"


def test_install_orca_downloads_extracts_and_updates_manifest(monkeypatch, tmp_path):
    archive = BytesIO()
    with zipfile.ZipFile(archive, "w") as zip_file:
        zip_file.writestr("OrcaSlicer/OrcaSlicer.exe", "fake exe")
    archive_bytes = archive.getvalue()

    class JsonResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "tag_name": "v2.3.2",
                "html_url": "https://github.com/OrcaSlicer/OrcaSlicer/releases/tag/v2.3.2",
                "assets": [
                    {
                        "name": "OrcaSlicer_Windows_x64_portable.zip",
                        "browser_download_url": "https://example.invalid/orca.zip",
                    }
                ],
            }

    class DownloadResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def raise_for_status(self):
            return None

        def iter_content(self, chunk_size):
            yield archive_bytes

    def fake_get(url, **kwargs):
        if url.endswith("/tags/v2.3.2"):
            return JsonResponse()
        return DownloadResponse()

    monkeypatch.setattr(slicer_manager.requests, "get", fake_get)

    result = slicer_manager.install_orca(root=tmp_path)
    status = slicer_manager.slicer_status(root=tmp_path)

    assert result["ok"] is True
    assert Path(result["binary_path"]).is_file()
    assert status["resolution"]["state"] == "installed"
    assert status["resolution"]["version"] == "v2.3.2"
