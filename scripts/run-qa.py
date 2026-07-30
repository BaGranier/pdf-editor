#!/usr/bin/env python3
"""Run reproducible browser QA, then always generate the Markdown summary."""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEB_DIR = PROJECT_ROOT / "apps" / "web"
BACKEND_DIR = PROJECT_ROOT / "services" / "pdf-engine"
GENERATE_SCRIPT = PROJECT_ROOT / "scripts" / "generate-qa-pdfs.py"
REPORT_SCRIPT = PROJECT_ROOT / "scripts" / "generate-qa-report.py"


def port_is_open(host: str, port: int) -> bool:
    with socket.socket() as probe:
        probe.settimeout(0.25)
        return probe.connect_ex((host, port)) == 0


def verify_existing_service(url: str, *, health: bool = False) -> None:
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            body = response.read()
            if response.status >= 400:
                raise RuntimeError(f"{url} répond HTTP {response.status}.")
            if health and json.loads(body) != {"status": "ok"}:
                raise RuntimeError(f"{url} n'est pas le backend PDF attendu.")
    except (OSError, urllib.error.URLError, json.JSONDecodeError) as error:
        raise RuntimeError(
            f"Le port de {url} est occupé par un service inattendu."
        ) from error


def check_ports() -> None:
    if port_is_open("127.0.0.1", 8000):
        verify_existing_service("http://127.0.0.1:8000/health", health=True)
    if port_is_open("127.0.0.1", 5173):
        verify_existing_service("http://127.0.0.1:5173")


def generate_fixtures(playwright_args: list[str]) -> None:
    quick_campaign = any(
        argument == "--grep-invert" or argument.startswith("--grep-invert=")
        for argument in playwright_args
    )
    command = [
        "uv",
        "run",
        "--directory",
        str(BACKEND_DIR),
        "python",
        str(GENERATE_SCRIPT),
    ]
    if not quick_campaign and os.environ.get("QA_SKIP_LARGE") != "1":
        command.append("--include-large")
    environment = {
        **os.environ,
        "UV_CACHE_DIR": str(PROJECT_ROOT / ".uv-cache"),
    }
    subprocess.run(command, cwd=PROJECT_ROOT, env=environment, check=True)


def main() -> int:
    playwright_args = sys.argv[1:]
    if os.environ.get("QA_SKIP_WEBSERVERS") != "1":
        check_ports()
    generate_fixtures(playwright_args)
    environment = dict(os.environ)
    local_browsers = PROJECT_ROOT / ".playwright-browsers"
    if local_browsers.exists():
        environment.setdefault("PLAYWRIGHT_BROWSERS_PATH", str(local_browsers))

    test_status = subprocess.run(
        ["npx", "playwright", "test", *playwright_args],
        cwd=WEB_DIR,
        env=environment,
        check=False,
    ).returncode
    report_status = subprocess.run(
        [sys.executable, str(REPORT_SCRIPT)],
        cwd=WEB_DIR,
        check=False,
    ).returncode
    return test_status if test_status != 0 else report_status


if __name__ == "__main__":
    raise SystemExit(main())
