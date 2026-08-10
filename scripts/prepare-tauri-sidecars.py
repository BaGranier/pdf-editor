#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import stat
import subprocess
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
TAURI_ROOT = REPOSITORY_ROOT / "apps" / "desktop" / "src-tauri"
SIDECAR_NAME = "pdf-engine"
SIDECAR_CONFIG_PATH = f"binaries/{SIDECAR_NAME}"


def target_triple() -> str:
    try:
        result = subprocess.run(
            ["rustc", "--print", "host-tuple"],
            check=True,
            capture_output=True,
            text=True,
        )
        value = result.stdout.strip()
        if value:
            return value
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass

    try:
        result = subprocess.run(
            ["rustc", "-Vv"],
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as error:
        raise RuntimeError("rustc est requis pour déterminer la cible Tauri.") from error
    for line in result.stdout.splitlines():
        if line.startswith("host: "):
            return line.removeprefix("host: ").strip()
    raise RuntimeError("La cible Rust hôte n'a pas pu être déterminée.")


def validate_external_bin() -> None:
    configuration = json.loads((TAURI_ROOT / "tauri.conf.json").read_text())
    external_bins = configuration.get("bundle", {}).get("externalBin", [])
    if SIDECAR_CONFIG_PATH not in external_bins:
        raise RuntimeError(
            f"bundle.externalBin doit déclarer {SIDECAR_CONFIG_PATH!r}."
        )


def prepare(source: Path, triple: str) -> Path:
    if not source.is_file():
        raise FileNotFoundError(f"Binaire sidecar introuvable: {source}")
    validate_external_bin()
    extension = ".exe" if "windows" in triple else ""
    destination = (
        TAURI_ROOT / "binaries" / f"{SIDECAR_NAME}-{triple}{extension}"
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    if os.name != "nt":
        destination.chmod(destination.stat().st_mode | stat.S_IXUSR)
    return destination


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Renomme un backend selon la convention sidecar Tauri v2.",
    )
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--target-triple", default=None)
    arguments = parser.parse_args()
    try:
        destination = prepare(
            arguments.source.resolve(),
            arguments.target_triple or target_triple(),
        )
    except (FileNotFoundError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"sidecar preparation failed: {error}", file=sys.stderr)
        return 1
    print(f"Sidecar Tauri prêt: {destination.relative_to(REPOSITORY_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
