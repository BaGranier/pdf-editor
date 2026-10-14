"""The same preparer is exercised against a synthetic empty clone, offline."""

import hashlib
import importlib
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture
def assets(monkeypatch: pytest.MonkeyPatch) -> ModuleType:
    monkeypatch.syspath_prepend(str(ROOT))
    return importlib.import_module("scripts.prepare-qa-assets")


def snapshot(root: Path) -> dict[str, tuple[str, int]]:
    return {
        str(path.relative_to(root)): (
            hashlib.sha256(path.read_bytes()).hexdigest(),
            path.stat().st_mtime_ns,
        )
        for path in root.rglob("*")
        if path.is_file()
    }


def test_empty_clone_idempotence_partial_repair_and_bounded_cleanup(
    assets: ModuleType,
    tmp_path: Path,
) -> None:
    result = assets.prepare("browser", root=tmp_path)
    assert result == {"created": 63, "validated": 63}
    first = snapshot(tmp_path)
    assert assets.prepare("browser", root=tmp_path)["created"] == 0
    assert snapshot(tmp_path) == first
    missing = tmp_path / assets.ROBUSTNESS / "asset-03.jpeg"
    missing.unlink()
    remaining = snapshot(tmp_path)
    assert assets.prepare("browser", root=tmp_path)["created"] == 1
    assert {
        name: value for name, value in snapshot(tmp_path).items() if name in remaining
    } == remaining
    # A measured output or user file sharing the directory is never cleaned.
    witness = tmp_path / assets.ROBUSTNESS / "measurement.json"
    witness.write_text("keep")
    small = tmp_path / assets.SMALL / "conversion-scan.pdf"
    original = small.read_bytes()
    assert assets.clean(tmp_path) == 33
    assert witness.read_text() == "keep"
    assert small.read_bytes() == original
    assert assets.prepare("browser", root=tmp_path)["created"] == 33


def test_corrupt_existing_asset_is_reported_without_replacement(
    assets: ModuleType,
    tmp_path: Path,
) -> None:
    target = tmp_path / assets.SMALL / "conversion-simple-text.pdf"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"corrupt synthetic PDF")
    before = snapshot(tmp_path)
    with pytest.raises((ValueError, RuntimeError), match="(?i)(PDF|document|file)"):
        assets.prepare("browser", skip_large=True, root=tmp_path)
    assert snapshot(tmp_path) == before


def test_ocr_download_is_explicit_pinned_and_cached(
    assets: ModuleType,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ocr = importlib.import_module("scripts.prepare-ocr-resources")
    binary = b"synthetic resource"
    monkeypatch.setattr(
        ocr, "FILES", {"eng.traineddata": hashlib.sha256(binary).hexdigest()}
    )
    calls = []

    def download(url: str, timeout: int) -> SimpleNamespace:
        calls.append((url, timeout))
        return SimpleNamespace(read=lambda: binary)

    monkeypatch.setattr(ocr.urllib.request, "urlopen", download)
    with pytest.raises(RuntimeError, match="Missing pinned OCR"):
        ocr.prepare(download=False, destination=tmp_path)
    assert not calls
    ocr.prepare(download=True, destination=tmp_path)
    assert calls == [(f"{ocr.BASE}/eng.traineddata", 60)]
    before = snapshot(tmp_path)
    ocr.prepare(download=False, destination=tmp_path)
    assert snapshot(tmp_path) == before
    resource = tmp_path / "tessdata/eng.traineddata"
    resource.write_bytes(b"corrupt")
    with pytest.raises(RuntimeError, match="checksum mismatch"):
        ocr.prepare(download=True, destination=tmp_path)
    assert len(calls) == 1


@pytest.mark.parametrize("quick", [False, True])
def test_browser_runner_always_prepares_integration_assets(
    assets: ModuleType,
    monkeypatch: pytest.MonkeyPatch,
    quick: bool,
) -> None:
    runner = importlib.import_module("scripts.run-qa")
    commands = []
    monkeypatch.delenv("QA_SKIP_LARGE", raising=False)
    monkeypatch.setattr(
        runner.subprocess, "run", lambda command, **_: commands.append(command)
    )
    runner.generate_fixtures(["--grep-invert", "@slow"] if quick else [])
    command = commands[0]
    expected = ["--mode", "browser", "--skip-large"] if quick else ["--mode", "browser"]
    assert command[-len(expected) :] == expected
    assert "scripts.prepare-qa-assets" in command
