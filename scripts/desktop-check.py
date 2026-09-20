#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DESKTOP_ROOT = REPOSITORY_ROOT / "apps" / "desktop"
TAURI_ROOT = DESKTOP_ROOT / "src-tauri"


def run(command: list[str], cwd: Path) -> None:
    print(f"+ {' '.join(command)}", flush=True)
    subprocess.run(command, cwd=cwd, check=True)


def validate_configuration() -> None:
    configuration = json.loads((TAURI_ROOT / "tauri.conf.json").read_text())
    assert configuration["identifier"] == "com.local.pdfstudio"
    assert configuration["build"]["frontendDist"] == "../../web/dist"
    assert configuration["build"]["devUrl"] == "http://127.0.0.1:5173"
    assert configuration["bundle"]["externalBin"] == ["binaries/pdf-engine"]
    assert configuration["bundle"]["fileAssociations"] == [
        {
            "ext": ["pdf"],
            "mimeType": "application/pdf",
            "name": "PDF document",
            "description": "PDF document",
            "role": "Editor",
        }
    ]

    package = json.loads((DESKTOP_ROOT / "package.json").read_text())
    web_dev_command = package["scripts"]["web:dev"]
    assert "--host 127.0.0.1" in web_dev_command
    assert "--port 5173" in web_dev_command
    assert "--strictPort" in web_dev_command

    capability = json.loads(
        (TAURI_ROOT / "capabilities" / "default.json").read_text()
    )
    permissions = capability["permissions"]
    assert permissions == ["core:default"]
    assert not any("shell:" in str(permission) for permission in permissions)
    print("OK configuration Tauri et capability frontend minimale")


def sidecar_or_development_mode() -> None:
    binaries = [
        path
        for path in (TAURI_ROOT / "binaries").glob("pdf-engine-*")
        if path.is_file() and path.stat().st_size > 0
    ]
    if binaries:
        print(f"OK sidecar préparé: {binaries[0].name}")
    else:
        print("OK mode développement détecté: backend source uv/Python")


def loopback_available() -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind(("127.0.0.1", 0))
        return True
    except PermissionError:
        print("SKIP /health: le sandbox interdit les sockets loopback")
        return False


def main(arguments: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--skip-cargo",
        action="store_true",
        help="Exécute les validations statiques sans prétendre vérifier Rust/Tauri.",
    )
    options = parser.parse_args(arguments)
    os.environ["UV_CACHE_DIR"] = str(
        Path(tempfile.gettempdir()) / "pdf-engine-uv-cache"
    )
    try:
        validate_configuration()
        sidecar_or_development_mode()
        run(["npm", "run", "build"], REPOSITORY_ROOT / "apps" / "web")
        backend_tests = [
            "uv",
            "run",
            "pytest",
            "tests/test_desktop_server.py",
            "-q",
        ]
        if not loopback_available():
            backend_tests.extend(["-m", "not desktop_network"])
        run(backend_tests, REPOSITORY_ROOT / "services" / "pdf-engine")
        if options.skip_cargo:
            print("SKIP cargo check: validation Rust/Tauri non exécutée à la demande.")
        elif shutil.which("cargo") is None:
            raise RuntimeError(
                "cargo est absent; installez Rust >= 1.88 avant desktop:check."
            )
        else:
            run(["cargo", "check", "--locked"], TAURI_ROOT)
    except (AssertionError, OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"desktop check failed: {error}", file=sys.stderr)
        return 1
    if options.skip_cargo:
        print("Desktop check statique terminé ; Rust/Tauri reste non vérifié.")
    else:
        print("Desktop check terminé avec succès.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
