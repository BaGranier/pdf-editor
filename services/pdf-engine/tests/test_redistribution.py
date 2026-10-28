from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest


def module():
    path = Path(__file__).resolve().parents[3] / "scripts/redistribution.py"
    spec = importlib.util.spec_from_file_location("redistribution", path)
    assert spec and spec.loader
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def test_sources_reject_uncommitted_tracked_changes(monkeypatch):
    release = module()
    monkeypatch.setattr(release, "git", lambda *args: "modified.py")
    with pytest.raises(ValueError, match="committed"):
        release.kit()


@pytest.mark.parametrize("status", ["NEEDS_REVIEW", "BLOCKED", "UNKNOWN"])
def test_gate_cannot_promote_an_unreviewed_component(tmp_path, monkeypatch, status):
    release = module()
    monkeypatch.setattr(release, "OUT", tmp_path)
    monkeypatch.setattr(release, "NOTICES", tmp_path)
    monkeypatch.setattr(release, "git", lambda *args: "" if args[0] == "diff" else "commit")
    (tmp_path / "RELEASE_MANIFEST.json").write_text(json.dumps({"commit": "commit", "status": "OK", "artifacts": []}))
    (tmp_path / "inventory.json").write_text(json.dumps({"rows": [{"status": status}]}))
    assert release.verify() is False


def test_release_gate_rejects_changed_artifact(tmp_path, monkeypatch):
    release = module()
    monkeypatch.setattr(release, "OUT", tmp_path)
    monkeypatch.setattr(release, "NOTICES", tmp_path)
    monkeypatch.setattr(release, "git", lambda *args: "" if args[0] == "diff" else "commit")
    payload = tmp_path / "notices.zip"
    payload.write_bytes(b"original")
    manifest = {"commit": "commit", "status": "OK", "artifacts": [release.record(payload)]}
    (tmp_path / "RELEASE_MANIFEST.json").write_text(json.dumps(manifest))
    (tmp_path / "inventory.json").write_text(json.dumps({"rows": []}))
    payload.write_bytes(b"changed")
    assert release.verify() is False
