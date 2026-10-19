"""Release notices must follow the frozen payload, including native extensions."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest


def load_inventory():
    path = Path(__file__).resolve().parents[3] / "scripts/release-inventory.py"
    spec = importlib.util.spec_from_file_location("release_inventory", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_only_frozen_packages_are_attributed_and_notice_paths_preserved(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    inventory = load_inventory()
    build = tmp_path / "build"
    build.mkdir()
    native = tmp_path / "runtime/native.pyd"
    native.parent.mkdir()
    native.write_bytes(b"native code")
    (build / "Analysis-00.toc").write_text(
        repr([[("runtime.native", str(native), "EXTENSION")]]), encoding="utf-8"
    )
    first = Path("runtime.dist-info/licenses/a/LICENSE")
    second = Path("runtime.dist-info/licenses/b/LICENSE")
    for name, content in [(first, b"first licence"), (second, b"second licence")]:
        path = tmp_path / name
        path.parent.mkdir(parents=True)
        path.write_bytes(content)
    runtime = SimpleNamespace(
        files=[Path("runtime/native.pyd"), first, second],
        metadata={"Name": "runtime", "License": "MIT"},
        version="1.0",
        locate_file=lambda file: tmp_path / file,
    )
    development = SimpleNamespace(
        files=[Path("devtool.py")],
        metadata={"Name": "unused-development-tool"},
        locate_file=lambda file: tmp_path / file,
    )
    monkeypatch.setattr(inventory, "BUILD", build)
    monkeypatch.setattr(inventory, "NOTICES", tmp_path / "notices")
    monkeypatch.setattr(
        inventory.importlib.metadata, "distributions", lambda: [runtime, development]
    )
    packages = inventory.frozen_packages()
    assert [package["name"] for package in packages] == ["runtime"]
    assert len(packages[0]["notices"]) == 2
    assert (inventory.NOTICES / "runtime" / first).read_bytes() == b"first licence"
    assert (inventory.NOTICES / "runtime" / second).read_bytes() == b"second licence"


def test_inventory_output_cannot_escape_ignored_artifacts(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    inventory = load_inventory()
    monkeypatch.setattr(inventory, "ROOT", tmp_path)
    monkeypatch.setattr(
        inventory.sys,
        "argv",
        ["release-inventory", "--output", str(tmp_path / "tracked.json")],
    )
    with pytest.raises(ValueError):
        inventory.main()
    assert not (tmp_path / "tracked.json").exists()
