from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from app import desktop_server


def _free_port() -> int:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind((desktop_server.DESKTOP_HOST, 0))
            return int(listener.getsockname()[1])
    except PermissionError:
        pytest.skip("Le sandbox interdit les tests réseau loopback.")


def _wait_for_health(port: int, timeout: float = 10.0) -> dict[str, str]:
    deadline = time.monotonic() + timeout
    url = f"http://{desktop_server.DESKTOP_HOST}:{port}/health"
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=0.5) as response:
                return json.loads(response.read())
        except (OSError, urllib.error.URLError) as error:
            last_error = error
            time.sleep(0.05)
    raise AssertionError(f"Le serveur desktop n'a pas répondu: {last_error}")


def _server_command(root: Path, port: int) -> list[str]:
    return [
        sys.executable,
        "-m",
        "app.desktop_server",
        "--host",
        desktop_server.DESKTOP_HOST,
        "--port",
        str(port),
        "--data-dir",
        str(root / "data"),
        "--log-dir",
        str(root / "logs"),
        "--temp-dir",
        str(root / "temp"),
        "--cache-dir",
        str(root / "cache"),
    ]


def test_desktop_options_refuse_network_hosts(tmp_path: Path) -> None:
    common_arguments = [
        "--data-dir",
        str(tmp_path / "data"),
        "--log-dir",
        str(tmp_path / "logs"),
        "--temp-dir",
        str(tmp_path / "temp"),
        "--cache-dir",
        str(tmp_path / "cache"),
    ]

    with pytest.raises(desktop_server.DesktopServerError, match="127.0.0.1"):
        desktop_server.parse_options(["--host", "0.0.0.0", *common_arguments])


def test_configure_environment_creates_desktop_directories(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    paths = desktop_server.DesktopPaths(
        data_dir=tmp_path / "desktop-data",
        log_dir=tmp_path / "desktop-logs",
        temp_dir=tmp_path / "desktop-temp",
        cache_dir=tmp_path / "desktop-cache",
    )
    monkeypatch.setattr(desktop_server.tempfile, "tempdir", None)

    log_path = desktop_server.configure_environment(paths)

    assert all(path.is_dir() for path in paths.__dict__.values())
    assert log_path.parent == paths.log_dir
    assert os.environ["PDF_ENGINE_DATA_DIR"] == str(paths.data_dir)


@pytest.mark.desktop_network
def test_desktop_server_uses_configured_port_and_stops_cleanly(
    tmp_path: Path,
) -> None:
    port = _free_port()
    process = subprocess.Popen(
        _server_command(tmp_path, port),
        cwd=Path(__file__).resolve().parents[1],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        assert _wait_for_health(port) == {"status": "ok"}
        assert process.poll() is None
        for directory in ("data", "logs", "temp", "cache"):
            assert (tmp_path / directory).is_dir()
        assert (tmp_path / "logs" / desktop_server.LOG_FILE_NAME).is_file()
        assert not (Path(__file__).resolve().parents[3] / "data" / "output" / "desktop-test.pdf").exists()
    finally:
        process.terminate()
        stdout, stderr = process.communicate(timeout=10)

    assert process.returncode == 0, f"stdout={stdout}\nstderr={stderr}"
    assert f"http://127.0.0.1:{port}/health" in stdout
