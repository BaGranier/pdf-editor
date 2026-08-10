#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPOSITORY_ROOT / "services" / "pdf-engine"
BUILD_ROOT = BACKEND_ROOT / "build" / "desktop-sidecar"
EXECUTABLE_NAME = "pdf-engine.exe" if os.name == "nt" else "pdf-engine"


def build() -> Path:
    command = [
        "uv",
        "run",
        "--with",
        "pyinstaller==6.16.0",
        "pyinstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--name",
        "pdf-engine",
        "--paths",
        str(BACKEND_ROOT),
        "--collect-submodules",
        "app",
        "--distpath",
        str(BUILD_ROOT / "dist"),
        "--workpath",
        str(BUILD_ROOT / "work"),
        "--specpath",
        str(BUILD_ROOT / "spec"),
        str(BACKEND_ROOT / "desktop_entrypoint.py"),
    ]
    subprocess.run(command, cwd=BACKEND_ROOT, check=True)
    executable = BUILD_ROOT / "dist" / EXECUTABLE_NAME
    if not executable.is_file():
        raise RuntimeError(f"PyInstaller n'a pas produit {executable}.")
    return executable


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def verify_health(executable: Path) -> None:
    port = free_port()
    with tempfile.TemporaryDirectory(prefix="pdf-engine-sidecar-check-") as root:
        root_path = Path(root)
        command = [
            str(executable),
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--data-dir",
            str(root_path / "data"),
            "--log-dir",
            str(root_path / "logs"),
            "--temp-dir",
            str(root_path / "temp"),
            "--cache-dir",
            str(root_path / "cache"),
        ]
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        deadline = time.monotonic() + 30
        try:
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    stdout, stderr = process.communicate()
                    raise RuntimeError(
                        f"Le sidecar s'est arrêté avant /health. stdout={stdout!r} "
                        f"stderr={stderr!r}"
                    )
                try:
                    with urllib.request.urlopen(
                        f"http://127.0.0.1:{port}/health",
                        timeout=0.5,
                    ) as response:
                        if json.loads(response.read()) == {"status": "ok"}:
                            return
                except (OSError, urllib.error.URLError, json.JSONDecodeError):
                    time.sleep(0.1)
            raise RuntimeError("Le sidecar n'a pas répondu à /health sous 30 secondes.")
        finally:
            if process.poll() is None:
                process.terminate()
            try:
                process.communicate(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.communicate()


def main() -> int:
    if shutil.which("uv") is None:
        print("uv est requis pour construire le sidecar.", file=sys.stderr)
        return 1
    try:
        executable = build()
        verify_health(executable)
        subprocess.run(
            [
                sys.executable,
                str(REPOSITORY_ROOT / "scripts" / "prepare-tauri-sidecars.py"),
                "--source",
                str(executable),
            ],
            cwd=REPOSITORY_ROOT,
            check=True,
        )
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"sidecar build failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
