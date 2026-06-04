"""Moonraker HTTP client."""

from __future__ import annotations

import ipaddress
import socket
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests
from requests import RequestException

from .validators import normalize_base_url


DEFAULT_TIMEOUT = 10
DISCOVERY_TIMEOUT = 0.25
DISCOVERY_WORKERS = 64
READINESS_OBJECTS: dict[str, list[str] | None] = {
    "print_stats": ["state", "filename"],
    "idle_timeout": ["state"],
    "virtual_sdcard": ["is_active", "file_path"],
    "pause_resume": ["is_paused"],
    "gcode_macro MYCO_STATE": [
        "piston_homed",
        "reservoir_ready",
        "material_primed",
        "reservoir_empty",
        "sync_mode",
    ],
    "gcode_macro START_PRINT": ["state"],
}
READY_PRINT_STATES = {"standby", "complete", "cancelled"}
BUSY_PRINT_STATES = {"printing", "paused", "error"}


def test_connection(base_url: str, timeout: int = DEFAULT_TIMEOUT) -> bool:
    try:
        response = requests.get(f"{normalize_base_url(base_url)}/server/info", timeout=timeout)
        return response.ok
    except (RequestException, ValueError):
        return False


def discover_printers(
    *,
    moonraker_port: int = 7125,
    control_port: int = 8080,
    timeout: float = DISCOVERY_TIMEOUT,
    subnet: str | None = None,
    fallback_host: str | None = None,
) -> dict[str, Any]:
    """Scan the local /24 for Moonraker and return structured candidates."""
    try:
        hosts = discovery_hosts(subnet=subnet, fallback_host=fallback_host)
    except ValueError as exc:
        return {"ok": False, "error": str(exc), "candidates": []}

    candidates: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=DISCOVERY_WORKERS) as pool:
        futures = [
            pool.submit(_probe_printer, host, moonraker_port, control_port, timeout)
            for host in hosts
        ]
        for future in as_completed(futures):
            candidate = future.result()
            if candidate:
                candidates.append(candidate)

    candidates.sort(key=lambda item: _ip_sort_key(str(item["host"])))
    return {"ok": True, "candidates": candidates}


def discovery_hosts(subnet: str | None = None, fallback_host: str | None = None) -> list[str]:
    """Return host addresses for a /24 scan, preferring the active local IPv4."""
    if subnet:
        network = ipaddress.ip_network(subnet, strict=False)
        if network.version != 4:
            raise ValueError("Printer discovery supports IPv4 subnets only.")
        return [str(host) for host in network.hosts()]

    local_ip = _primary_ipv4() or _host_to_ipv4(fallback_host)
    if not local_ip:
        raise ValueError("Could not determine a local IPv4 subnet for printer discovery.")
    network = ipaddress.ip_network(f"{local_ip}/24", strict=False)
    return [str(host) for host in network.hosts()]


def get_printer_status(base_url: str, timeout: int = DEFAULT_TIMEOUT) -> dict[str, Any]:
    try:
        response = requests.get(f"{normalize_base_url(base_url)}/printer/info", timeout=timeout)
        return _response_payload(response)
    except (RequestException, ValueError) as exc:
        return {"ok": False, "error": str(exc)}


def get_print_readiness(base_url: str, timeout: int = DEFAULT_TIMEOUT) -> dict[str, Any]:
    """Return whether it is safe to start a paste print through Moonraker."""
    info = get_printer_status(base_url, timeout=timeout)
    if not info.get("ok"):
        error = str(info.get("error") or "Moonraker printer info request failed.")
        return _readiness_payload(
            ok=False,
            reasons=[f"Klipper/Moonraker not reachable: {error}"],
            error=error,
        )

    query = query_printer_objects(base_url, READINESS_OBJECTS, timeout=timeout)
    if not query.get("ok"):
        error = str(query.get("error") or "Moonraker object query failed.")
        return _readiness_payload(
            ok=False,
            klippy_state=_printer_info_state(info),
            reasons=[f"Printer readiness query failed: {error}"],
            error=error,
        )

    klippy_state = _printer_info_state(info)
    status = _query_status(query)
    print_stats = _object_status(status, "print_stats")
    idle_timeout = _object_status(status, "idle_timeout")
    virtual_sdcard = _object_status(status, "virtual_sdcard")
    pause_resume = _object_status(status, "pause_resume")
    myco_state = _object_status(status, "gcode_macro MYCO_STATE")
    start_print = _object_status(status, "gcode_macro START_PRINT")

    print_state = _string_value(print_stats.get("state"))
    idle_state = _string_value(idle_timeout.get("state"))
    is_paused = _bool_value(pause_resume.get("is_paused"))
    virtual_sd_active = _bool_value(virtual_sdcard.get("is_active"))
    piston_homed = _flag_value(myco_state.get("piston_homed"))
    reservoir_ready = _flag_value(myco_state.get("reservoir_ready"))
    material_primed = _flag_value(myco_state.get("material_primed"))
    reservoir_empty = _flag_value(myco_state.get("reservoir_empty"))
    sync_mode = _string_value(myco_state.get("sync_mode"))
    start_print_state = _string_value(start_print.get("state"))

    reasons: list[str] = []
    if klippy_state != "ready":
        reasons.append(f"Klipper state is {klippy_state or 'unknown'}, expected ready.")

    if not print_stats:
        reasons.append("Moonraker print_stats object is missing.")
    elif print_state.lower() in BUSY_PRINT_STATES:
        reasons.append(f"Printer is currently {print_state}.")
    elif print_state and print_state.lower() not in READY_PRINT_STATES:
        reasons.append(f"Printer print state is {print_state}, expected standby/complete/cancelled.")

    if idle_state.lower() == "printing":
        reasons.append("Klipper idle_timeout reports Printing.")
    if is_paused is True:
        reasons.append("Printer is paused.")
    if virtual_sd_active is True:
        reasons.append("Virtual SD card is already active.")

    if not myco_state:
        reasons.append("Klipper macro object gcode_macro MYCO_STATE is missing.")
    else:
        _require_flag(reasons, "Piston is not homed.", piston_homed, expected=1)
        _require_flag(reasons, "Reservoir is not marked ready.", reservoir_ready, expected=1)
        _require_flag(reasons, "Material is not primed.", material_primed, expected=1)
        _require_flag(reasons, "Reservoir is marked empty.", reservoir_empty, expected=0)

    if start_print_state and start_print_state != "Prepare":
        reasons.append(f"START_PRINT state is {start_print_state}, expected Prepare.")

    return _readiness_payload(
        ok=True,
        klippy_state=klippy_state,
        print_state=print_state or None,
        idle_state=idle_state or None,
        is_paused=is_paused,
        virtual_sd_active=virtual_sd_active,
        piston_homed=piston_homed,
        reservoir_ready=reservoir_ready,
        material_primed=material_primed,
        reservoir_empty=reservoir_empty,
        sync_mode=sync_mode or None,
        start_print_state=start_print_state or None,
        reasons=reasons,
    )


def _probe_printer(
    host: str,
    moonraker_port: int,
    control_port: int,
    timeout: float,
) -> dict[str, Any] | None:
    moonraker_url = f"http://{host}:{moonraker_port}"
    try:
        response = requests.get(f"{moonraker_url}/server/info", timeout=timeout)
    except RequestException:
        return None
    if not response.ok:
        return None

    payload = _safe_json(response)
    result = payload.get("result") if isinstance(payload, dict) else None
    label = _candidate_label(host, result)
    control_url = f"http://{host}:{control_port}/"
    control_ok = _probe_control(control_url, timeout)
    return {
        "host": host,
        "label": label,
        "moonrakerUrl": moonraker_url,
        "controlUrl": control_url,
        "moonrakerOk": True,
        "controlOk": control_ok,
    }


def _probe_control(url: str, timeout: float) -> bool:
    try:
        return requests.get(url, timeout=timeout).ok
    except RequestException:
        return False


def _safe_json(response: requests.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return {}


def _candidate_label(host: str, result: Any) -> str:
    if isinstance(result, dict):
        for key in ("hostname", "machine", "software_version"):
            value = result.get(key)
            if value:
                return f"{value} ({host})"
    return host


def _primary_ipv4() -> str | None:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as handle:
            handle.connect(("8.8.8.8", 80))
            value = handle.getsockname()[0]
            if not value.startswith("127."):
                return value
    except OSError:
        return None
    return None


def _host_to_ipv4(host: str | None) -> str | None:
    if not host:
        return None
    try:
        value = socket.gethostbyname(host)
        if not value.startswith("127."):
            return value
    except OSError:
        return None
    return None


def _ip_sort_key(host: str) -> tuple[int, str]:
    try:
        return (0, f"{int(ipaddress.ip_address(host)):012d}")
    except ValueError:
        return (1, host)


def query_printer_object(
    base_url: str,
    object_name: str,
    timeout: int = DEFAULT_TIMEOUT,
) -> dict[str, Any]:
    """Query one Moonraker printer object by its exact object name."""
    try:
        url = f"{normalize_base_url(base_url)}/printer/objects/query?{quote(object_name, safe='')}"
        response = requests.get(url, timeout=timeout)
        return _response_payload(response)
    except (RequestException, ValueError) as exc:
        return {"ok": False, "error": str(exc)}


def query_printer_objects(
    base_url: str,
    objects: dict[str, list[str] | None],
    timeout: int = DEFAULT_TIMEOUT,
) -> dict[str, Any]:
    """Query multiple Moonraker printer objects in one request."""
    try:
        url = f"{normalize_base_url(base_url)}/printer/objects/query"
        response = requests.post(url, json={"objects": objects}, timeout=timeout)
        return _response_payload(response)
    except (RequestException, ValueError) as exc:
        return {"ok": False, "error": str(exc)}


def upload_gcode(
    base_url: str,
    file_path: str | Path,
    remote_name: str | None = None,
    start_print: bool = False,
    timeout: int = 60,
) -> dict[str, Any]:
    path = Path(file_path)
    if not path.is_file():
        return {"ok": False, "error": f"G-code file does not exist: {path}"}

    try:
        url = f"{normalize_base_url(base_url)}/server/files/upload"
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}

    upload_name = remote_name or path.name
    data = {
        "root": "gcodes",
        "print": "true" if start_print else "false",
    }

    try:
        with path.open("rb") as handle:
            files = {"file": (upload_name, handle, "application/octet-stream")}
            response = requests.post(url, data=data, files=files, timeout=timeout)
        return _response_payload(response)
    except RequestException as exc:
        return {"ok": False, "error": str(exc)}


def _response_payload(response: requests.Response) -> dict[str, Any]:
    try:
        payload = response.json()
    except ValueError:
        payload = {"text": response.text}

    if response.ok:
        return {"ok": True, "status_code": response.status_code, "data": payload}

    return {
        "ok": False,
        "status_code": response.status_code,
        "error": _extract_error(payload),
        "data": payload,
    }


def _extract_error(payload: Any) -> str:
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            return str(error.get("message") or error)
        if error:
            return str(error)
        if payload.get("message"):
            return str(payload["message"])
    return str(payload)


def _readiness_payload(
    *,
    ok: bool,
    reasons: list[str],
    klippy_state: str | None = None,
    print_state: str | None = None,
    idle_state: str | None = None,
    is_paused: bool | None = None,
    virtual_sd_active: bool | None = None,
    piston_homed: int | None = None,
    reservoir_ready: int | None = None,
    material_primed: int | None = None,
    reservoir_empty: int | None = None,
    sync_mode: str | None = None,
    start_print_state: str | None = None,
    error: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "ok": ok,
        "ready": ok and not reasons,
        "reasons": reasons,
        "klippy_state": klippy_state,
        "print_state": print_state,
        "idle_state": idle_state,
        "is_paused": is_paused,
        "virtual_sd_active": virtual_sd_active,
        "piston_homed": piston_homed,
        "reservoir_ready": reservoir_ready,
        "material_primed": material_primed,
        "reservoir_empty": reservoir_empty,
        "sync_mode": sync_mode,
        "start_print_state": start_print_state,
    }
    if error:
        payload["error"] = error
    return payload


def _printer_info_state(info: dict[str, Any]) -> str | None:
    data = info.get("data")
    if not isinstance(data, dict):
        return None
    result = data.get("result")
    if isinstance(result, dict):
        return _string_value(result.get("state")) or None
    return _string_value(data.get("state")) or None


def _query_status(query: dict[str, Any]) -> dict[str, Any]:
    data = query.get("data")
    if not isinstance(data, dict):
        return {}
    result = data.get("result")
    if isinstance(result, dict):
        status = result.get("status")
        return status if isinstance(status, dict) else {}
    status = data.get("status")
    return status if isinstance(status, dict) else {}


def _object_status(status: dict[str, Any], name: str) -> dict[str, Any]:
    value = status.get(name)
    return value if isinstance(value, dict) else {}


def _string_value(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _bool_value(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "on"}:
            return True
        if normalized in {"false", "0", "no", "off"}:
            return False
    return None


def _flag_value(value: Any) -> int | None:
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        try:
            return int(float(value.strip()))
        except ValueError:
            return None
    return None


def _require_flag(reasons: list[str], message: str, actual: int | None, *, expected: int) -> None:
    if actual != expected:
        reasons.append(message if actual is not None else f"{message} State is unavailable.")
