"""Packaging guards: no actual Microsoft binaries or toolchain are needed here."""

from __future__ import annotations

import json
import importlib.util
from pathlib import Path
import sys
from types import ModuleType

import pytest

spec = importlib.util.spec_from_file_location(
    "windows_crt", Path(__file__).resolve().parents[3] / "scripts/windows_crt.py"
)
assert spec and spec.loader
crt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(crt)


@pytest.fixture
def payload(tmp_path, monkeypatch):
    directory = tmp_path / "VC/Redist/MSVC/14.44/x64/Microsoft.VC143.CRT"
    directory.mkdir(parents=True)
    engine = tmp_path / "engine.pyd"
    engine.write_bytes(b"engine")
    primary = directory / "msvcp140.dll"
    primary.write_bytes(b"primary")
    additional = directory / "vcruntime140.dll"
    additional.write_bytes(b"additional")
    unused = directory / "concrt140.dll"
    unused.write_bytes(b"unused")
    infos = {
        b"engine": {"imports": {"msvcp140.dll": ["std"]}, "exports": set()},
        b"primary": {"imports": {"vcruntime140.dll": ["runtime"]}, "exports": {"std"}},
        b"additional": {"imports": {}, "exports": {"runtime"}},
        b"unused": {"imports": {}, "exports": set()},
        b"exe": {"imports": {}, "exports": set()},
    }
    for info in infos.values():
        info.update(machine=0x8664, version="14.44.1.0")
    monkeypatch.setattr(crt, "pe_info", lambda data: infos[data])
    monkeypatch.setattr(crt, "discover", lambda: {"crtDirectory": str(directory)})
    monkeypatch.setattr(crt, "PROVENANCE", tmp_path / "provenance.json")
    original = tmp_path / "System32/msvcp140.dll"
    original.parent.mkdir()
    original.write_bytes(b"obsolete")
    binaries = [
        ("engine.pyd", str(engine), "EXTENSION"),
        ("MSVCP140.dll", str(original), "BINARY"),
    ]
    return directory, binaries, infos


def test_spec_selects_transitive_minimum_and_removes_system_copy(payload):
    directory, binaries, _ = payload
    normalized = crt.normalize(binaries)
    selected = {
        name: source for name, source, _ in normalized if crt.CRT_NAME.fullmatch(name)
    }
    assert set(selected) == {"msvcp140.dll", "vcruntime140.dll"}
    assert all(source.startswith(str(directory)) for source in selected.values())


@pytest.mark.parametrize(
    "failure", ["missing", "wrong-arch", "mixed-version", "missing-symbol"]
)
def test_spec_refuses_incomplete_or_incompatible_redist(payload, failure):
    directory, binaries, infos = payload
    if failure == "missing":
        (directory / "vcruntime140.dll").unlink()
    elif failure == "wrong-arch":
        infos[b"primary"]["machine"] = 0x14C
    elif failure == "mixed-version":
        infos[b"additional"]["version"] = "14.38.1.0"
    else:
        infos[b"primary"]["exports"] = set()
    with pytest.raises(ValueError):
        crt.normalize(binaries)


@pytest.mark.parametrize(
    "failure",
    ["none", "forbidden-source", "nested-copy", "missing-crt", "altered-bytes"],
)
def test_final_archive_is_checked_against_official_sources(
    payload, monkeypatch, tmp_path, failure
):
    _, binaries, _ = payload
    crt.normalize(binaries)
    archive = {
        "engine.pyd": b"engine",
        "msvcp140.dll": b"primary",
        "vcruntime140.dll": b"additional",
    }
    if failure == "forbidden-source":
        report = json.loads(crt.PROVENANCE.read_text())
        report["files"][0]["source"] = str(tmp_path / "System32/msvcp140.dll")
        crt.PROVENANCE.write_text(json.dumps(report))
    elif failure == "nested-copy":
        archive["other/msvcp140.dll"] = b"primary"
    elif failure == "missing-crt":
        del archive["vcruntime140.dll"]
    elif failure == "altered-bytes":
        archive["msvcp140.dll"] = b"additional"
    readers = ModuleType("PyInstaller.archive.readers")

    class Reader:
        def __init__(self, _):
            self.toc = archive

        def extract(self, name):
            return archive[name]

    readers.CArchiveReader = Reader
    monkeypatch.setitem(sys.modules, "PyInstaller", ModuleType("PyInstaller"))
    monkeypatch.setitem(
        sys.modules, "PyInstaller.archive", ModuleType("PyInstaller.archive")
    )
    monkeypatch.setitem(sys.modules, "PyInstaller.archive.readers", readers)
    exe = tmp_path / "sidecar.exe"
    exe.write_bytes(b"exe")
    if failure == "none":
        assert crt.verify_payload(exe, crt.PROVENANCE)["noLegacyCrtCopies"]
    else:
        with pytest.raises(ValueError):
            crt.verify_payload(exe, crt.PROVENANCE)
