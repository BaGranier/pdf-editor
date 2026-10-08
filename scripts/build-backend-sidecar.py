#!/usr/bin/env python3
from __future__ import annotations

import json
import ctypes
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
    import importlib

    resources = importlib.import_module("scripts.prepare-ocr-resources").prepare()
    importlib.import_module("scripts.audit-ocr-licenses").main()
    command = [
        "uv",
        "run",
        "--with",
        "pyinstaller==6.16.0",
        "python",
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--name",
        "pdf-engine",
        "--paths",
        str(BACKEND_ROOT),
        "--collect-submodules",
        "app",
        "--add-data",
        f"{resources}{os.pathsep}ocr",
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
            worker_handle = None
            if os.name == "nt":
                try:
                    worker_pid = int((root_path / "temp/.backend-lease").read_text())
                    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
                    kernel.OpenProcess.argtypes = [
                        ctypes.c_uint,
                        ctypes.c_int,
                        ctypes.c_uint,
                    ]
                    kernel.OpenProcess.restype = ctypes.c_void_p
                    kernel.WaitForSingleObject.argtypes = [
                        ctypes.c_void_p,
                        ctypes.c_uint,
                    ]
                    kernel.TerminateProcess.argtypes = [ctypes.c_void_p, ctypes.c_uint]
                    kernel.CloseHandle.argtypes = [ctypes.c_void_p]
                    if worker_pid > 0 and worker_pid != process.pid:
                        worker_handle = kernel.OpenProcess(0x100001, False, worker_pid)
                except (OSError, ValueError):
                    pass
            if process.poll() is None:
                if os.name == "nt":
                    subprocess.run(
                        ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                        check=False,
                        capture_output=True,
                        creationflags=subprocess.CREATE_NO_WINDOW,
                    )
                else:
                    process.terminate()
            if worker_handle:
                # PyInstaller's bootloader can finish before its worker releases
                # Windows file handles. Holding its handle prevents PID reuse
                # from redirecting this QA cleanup to another process.
                try:
                    if kernel.WaitForSingleObject(worker_handle, 1000) == 258:
                        kernel.TerminateProcess(worker_handle, 1)
                        if kernel.WaitForSingleObject(worker_handle, 10000) == 258:
                            raise RuntimeError(
                                "Le worker de vérification sidecar reste actif."
                            )
                finally:
                    kernel.CloseHandle(worker_handle)
            try:
                process.communicate(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.communicate()
            for attempt in range(50):
                try:
                    shutil.rmtree(root_path)
                    break
                except FileNotFoundError:
                    break
                except PermissionError:
                    if attempt == 49:
                        raise
                    time.sleep(0.1)


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
                "-m",
                "scripts.prepare-tauri-sidecars",
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
