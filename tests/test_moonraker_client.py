import json
from pathlib import Path

from typer.testing import CliRunner

from mycoforge_cli import main as cli
from mycoforge_cli import moonraker_client


class FakeResponse:
    def __init__(self, ok=True, status_code=200, payload=None, text=""):
        self.ok = ok
        self.status_code = status_code
        self._payload = payload if payload is not None else {}
        self.text = text

    def json(self):
        return self._payload


def test_connection_uses_server_info(monkeypatch):
    calls = []

    def fake_get(url, timeout):
        calls.append((url, timeout))
        return FakeResponse(ok=True, payload={"result": "server"})

    monkeypatch.setattr(moonraker_client.requests, "get", fake_get)

    assert moonraker_client.test_connection("http://printer.local:7125") is True
    assert calls[0][0] == "http://printer.local:7125/server/info"


def test_upload_gcode_sets_print_false(monkeypatch, tmp_path):
    gcode = tmp_path / "job.gcode"
    gcode.write_text("G1 X0\n", encoding="utf-8")
    captured = {}

    def fake_post(url, data, files, timeout):
        captured["url"] = url
        captured["data"] = data
        captured["filename"] = files["file"][0]
        return FakeResponse(ok=True, status_code=201, payload={"print_started": False})

    monkeypatch.setattr(moonraker_client.requests, "post", fake_post)

    result = moonraker_client.upload_gcode("http://printer.local:7125", gcode)

    assert result["ok"] is True
    assert captured["url"] == "http://printer.local:7125/server/files/upload"
    assert captured["data"] == {"root": "gcodes", "print": "false"}
    assert captured["filename"] == "job.gcode"


def test_upload_gcode_sets_print_true(monkeypatch, tmp_path):
    gcode = tmp_path / "job.gcode"
    gcode.write_text("G1 X0\n", encoding="utf-8")
    captured = {}

    def fake_post(url, data, files, timeout):
        captured["data"] = data
        return FakeResponse(ok=True, status_code=201, payload={"print_started": True})

    monkeypatch.setattr(moonraker_client.requests, "post", fake_post)

    result = moonraker_client.upload_gcode("http://printer.local:7125", gcode, start_print=True)

    assert result["ok"] is True
    assert captured["data"]["print"] == "true"


def test_get_print_readiness_allows_ready_primed_printer(monkeypatch):
    def fake_get(url, timeout):
        assert url == "http://printer.local:7125/printer/info"
        return FakeResponse(ok=True, payload={"result": {"state": "ready"}})

    def fake_post(url, json, timeout):
        assert url == "http://printer.local:7125/printer/objects/query"
        assert "gcode_macro MYCO_STATE" in json["objects"]
        return FakeResponse(
            ok=True,
            payload={
                "result": {
                    "status": {
                        "print_stats": {"state": "standby"},
                        "idle_timeout": {"state": "Idle"},
                        "virtual_sdcard": {"is_active": False},
                        "pause_resume": {"is_paused": False},
                        "gcode_macro MYCO_STATE": {
                            "piston_homed": 1,
                            "reservoir_ready": 1,
                            "material_primed": 1,
                            "reservoir_empty": 0,
                            "sync_mode": "off",
                        },
                        "gcode_macro START_PRINT": {"state": "Prepare"},
                    }
                }
            },
        )

    monkeypatch.setattr(moonraker_client.requests, "get", fake_get)
    monkeypatch.setattr(moonraker_client.requests, "post", fake_post)

    result = moonraker_client.get_print_readiness("http://printer.local:7125")

    assert result["ok"] is True
    assert result["ready"] is True
    assert result["reasons"] == []
    assert result["material_primed"] == 1
    assert result["sync_mode"] == "off"


def test_get_print_readiness_blocks_missing_myco_state(monkeypatch):
    def fake_get(url, timeout):
        return FakeResponse(ok=True, payload={"result": {"state": "ready"}})

    def fake_post(url, json, timeout):
        return FakeResponse(
            ok=True,
            payload={
                "result": {
                    "status": {
                        "print_stats": {"state": "standby"},
                        "idle_timeout": {"state": "Idle"},
                        "virtual_sdcard": {"is_active": False},
                        "pause_resume": {"is_paused": False},
                    }
                }
            },
        )

    monkeypatch.setattr(moonraker_client.requests, "get", fake_get)
    monkeypatch.setattr(moonraker_client.requests, "post", fake_post)

    result = moonraker_client.get_print_readiness("http://printer.local:7125")

    assert result["ready"] is False
    assert "gcode_macro MYCO_STATE is missing" in result["reasons"][0]


def test_print_command_blocks_upload_when_printer_is_not_ready(monkeypatch, tmp_path):
    gcode = tmp_path / "job.gcode"
    gcode.write_text("G1 X0\n", encoding="utf-8")
    upload_called = False

    def fake_upload(*args, **kwargs):
        nonlocal upload_called
        upload_called = True
        return {"ok": True}

    monkeypatch.setattr(
        cli,
        "get_print_readiness",
        lambda url: {"ok": True, "ready": False, "reasons": ["Material is not primed."]},
    )
    monkeypatch.setattr(cli, "upload_gcode", fake_upload)

    result = CliRunner().invoke(
        cli.app, ["print", str(gcode), "--moonraker", "http://printer.local:7125"]
    )

    assert result.exit_code == 1
    assert upload_called is False
    payload = json.loads(result.output)
    assert payload["stage"] == "print-readiness"
    assert "Material is not primed." in payload["error"]


def test_print_command_uploads_when_printer_is_ready(monkeypatch, tmp_path):
    gcode = tmp_path / "job.gcode"
    gcode.write_text("G1 X0\n", encoding="utf-8")
    captured = {}

    monkeypatch.setattr(
        cli,
        "get_print_readiness",
        lambda url: {"ok": True, "ready": True, "reasons": []},
    )

    def fake_upload(moonraker, file_path, remote_name=None, start_print=False):
        captured.update(
            {
                "moonraker": moonraker,
                "file_path": file_path,
                "remote_name": remote_name,
                "start_print": start_print,
            }
        )
        return {"ok": True, "print_started": True}

    monkeypatch.setattr(cli, "upload_gcode", fake_upload)

    result = CliRunner().invoke(
        cli.app, ["print", str(gcode), "--moonraker", "http://printer.local:7125"]
    )

    assert result.exit_code == 0, result.output
    assert captured["moonraker"] == "http://printer.local:7125"
    assert captured["file_path"] == gcode
    assert captured["start_print"] is True


def test_upload_gcode_returns_structured_error_for_missing_file():
    result = moonraker_client.upload_gcode("http://printer.local:7125", Path("missing.gcode"))

    assert result["ok"] is False
    assert "does not exist" in result["error"]


def test_query_printer_object_uses_moonraker_object_query(monkeypatch):
    calls = []

    def fake_get(url, timeout):
        calls.append((url, timeout))
        return FakeResponse(ok=True, payload={"result": {"status": {}}})

    monkeypatch.setattr(moonraker_client.requests, "get", fake_get)

    result = moonraker_client.query_printer_object(
        "http://printer.local:7125", "gcode_macro MYCO_STATE"
    )

    assert result["ok"] is True
    assert calls[0][0] == "http://printer.local:7125/printer/objects/query?gcode_macro%20MYCO_STATE"


def test_discover_printers_returns_moonraker_candidates(monkeypatch):
    def fake_get(url, timeout):
        if url == "http://192.168.1.1:7125/server/info":
            return FakeResponse(ok=True, payload={"result": {"hostname": "mycoforge"}})
        if url == "http://192.168.1.1:8080/":
            return FakeResponse(ok=True, payload={})
        raise moonraker_client.RequestException("offline")

    monkeypatch.setattr(moonraker_client.requests, "get", fake_get)

    result = moonraker_client.discover_printers(subnet="192.168.1.0/30", timeout=0.01)

    assert result["ok"] is True
    assert result["candidates"] == [
        {
            "host": "192.168.1.1",
            "label": "mycoforge (192.168.1.1)",
            "moonrakerUrl": "http://192.168.1.1:7125",
            "controlUrl": "http://192.168.1.1:8080/",
            "moonrakerOk": True,
            "controlOk": True,
        }
    ]


def test_discover_printers_reports_no_candidates(monkeypatch):
    def fake_get(url, timeout):
        raise moonraker_client.RequestException("offline")

    monkeypatch.setattr(moonraker_client.requests, "get", fake_get)

    result = moonraker_client.discover_printers(subnet="192.168.1.0/30", timeout=0.01)

    assert result == {"ok": True, "candidates": []}


def test_discover_printers_ignores_per_host_timeouts(monkeypatch):
    def fake_get(url, timeout):
        if "192.168.1.1" in url:
            raise moonraker_client.RequestException("timeout")
        if url == "http://192.168.1.2:7125/server/info":
            return FakeResponse(ok=True, payload={"result": {}})
        return FakeResponse(ok=False)

    monkeypatch.setattr(moonraker_client.requests, "get", fake_get)

    result = moonraker_client.discover_printers(subnet="192.168.1.0/30", timeout=0.01)

    assert result["ok"] is True
    assert [candidate["host"] for candidate in result["candidates"]] == ["192.168.1.2"]
