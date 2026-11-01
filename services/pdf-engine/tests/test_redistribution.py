from __future__ import annotations

import importlib.util
import json
import io
import tarfile
import zipfile
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


@pytest.mark.parametrize(
    "path,allowed", [("MVP_STATUS.md", True), ("apps/web/src/App.tsx", False)]
)
def test_build_commit_allows_documentation_review_only(monkeypatch, path, allowed):
    release = module()
    monkeypatch.setattr(release, "git", lambda *args: "" if args[1] == "HEAD" else path)
    if allowed:
        assert (
            release.build_identity({"commit": "built", "trackedChanges": ""}) == "built"
        )
    else:
        with pytest.raises(ValueError, match="rebuild"):
            release.build_identity({"commit": "built", "trackedChanges": ""})


@pytest.mark.parametrize("status", ["NEEDS_REVIEW", "BLOCKED", "UNKNOWN"])
def test_gate_cannot_promote_an_unreviewed_component(tmp_path, monkeypatch, status):
    release = module()
    monkeypatch.setattr(release, "OUT", tmp_path)
    monkeypatch.setattr(release, "NOTICES", tmp_path)
    monkeypatch.setattr(
        release, "git", lambda *args: "" if args[0] == "diff" else "commit"
    )
    (tmp_path / "RELEASE_MANIFEST.json").write_text(
        json.dumps({"commit": "commit", "status": "OK", "artifacts": []})
    )
    (tmp_path / "inventory.json").write_text(json.dumps({"rows": [{"status": status}]}))
    assert release.verify() is False


def test_release_gate_rejects_changed_artifact(tmp_path, monkeypatch):
    release = module()
    monkeypatch.setattr(release, "OUT", tmp_path)
    monkeypatch.setattr(release, "NOTICES", tmp_path)
    monkeypatch.setattr(
        release, "git", lambda *args: "" if args[0] == "diff" else "commit"
    )
    payload = tmp_path / "notices.zip"
    payload.write_bytes(b"original")
    manifest = {
        "commit": "commit",
        "status": "OK",
        "artifacts": [release.record(payload)],
    }
    (tmp_path / "RELEASE_MANIFEST.json").write_text(json.dumps(manifest))
    (tmp_path / "inventory.json").write_text(json.dumps({"rows": []}))
    payload.write_bytes(b"changed")
    assert release.verify() is False


def native_module():
    path = Path(__file__).resolve().parents[3] / "scripts/native_redistribution.py"
    spec = importlib.util.spec_from_file_location("native_redistribution", path)
    assert spec and spec.loader
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def test_native_review_rejects_functional_source_changes(monkeypatch):
    native = native_module()
    monkeypatch.setattr(
        native, "git", lambda *args: "" if args[1] == "HEAD" else "apps/web/src/App.tsx"
    )
    assert native.metadata_only() is False


def test_static_graph_ignores_excluded_missing_sources_and_checks_notices():
    native = native_module()
    xml = b"""<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003"><ItemGroup>
    <ClCompile Include="../../thirdparty/zlib/used.c" />
    <ClCompile Include="../../thirdparty/zlib/missing.c"><ExcludedFromBuild>true</ExcludedFromBuild></ClCompile>
    </ItemGroup></Project>"""
    data = io.BytesIO()
    with tarfile.open(fileobj=data, mode="w") as archive:
        for name, value in {
            "platform/win32/mupdfcpp.vcxproj": xml,
            "thirdparty/zlib/used.c": b"source",
            "thirdparty/zlib/LICENSE": b"licence",
        }.items():
            entry = tarfile.TarInfo("mupdf/" + name)
            entry.size = len(value)
            archive.addfile(entry, io.BytesIO(value))
    notices = io.BytesIO()
    with zipfile.ZipFile(notices, "w") as archive:
        archive.writestr("zlib-LICENSE", b"licence")
    data.seek(0)
    notices.seek(0)
    with tarfile.open(fileobj=data) as archive, zipfile.ZipFile(notices) as notice_zip:
        graph = native.static_graph(archive, notice_zip)
    assert graph["components"]["zlib"]["status"] == "OK"
    assert graph["components"]["zlib"]["sources"] == ["thirdparty/zlib/used.c"]


@pytest.mark.parametrize("tamper", ["none", "artifact", "inventory-promoted"])
def test_external_review_preserves_pending_crt_and_hash_checks(
    tmp_path, monkeypatch, tamper
):
    native = native_module()
    directory = tmp_path / "data/output/mvp-003"
    directory.mkdir(parents=True)
    monkeypatch.setattr(native, "ROOT", tmp_path)
    monkeypatch.setattr(native, "git", lambda *args: "review")
    monkeypatch.setattr(native, "metadata_only", lambda: True)
    installer = directory / "app_x64-setup.exe"
    installer.write_bytes(b"installer")
    source = directory / "app_sources.zip"
    source.write_bytes(b"source")
    monkeypatch.setattr(native, "NSIS_SHA", native.sha(installer.read_bytes()))
    monkeypatch.setattr(native, "SOURCE_SHA", native.sha(source.read_bytes()))
    proof = {
        "nsis": {"sha256": native.NSIS_SHA},
        "sourceArchive": {"sha256": native.SOURCE_SHA},
        "matchedMuPDFHeaders": 82,
        "runtime": {"pymupdf": "1.26.3", "mupdf": "1.26.3"},
        "staticBuild": {
            "components": {name: {"status": "OK"} for name in native.LICENSES}
        },
        "crt": {"status": "OK" if tamper == "artifact" else "NEEDS_REVIEW"},
        "webview2": {"status": "OK"},
    }
    native.write_json(directory / "native-inventory.json", proof)
    native.write_json(
        directory / "redistribution-inventory.json",
        {
            "rows": [
                {
                    "status": "OK"
                    if tamper in {"inventory-promoted", "artifact"}
                    else "NEEDS_REVIEW"
                }
            ]
        },
    )
    (directory / "THIRD_PARTY_NOTICES_MVP-003.zip").write_bytes(b"notices")
    artifacts = [
        {**native.file_record(path), "path": path.name} for path in directory.iterdir()
    ]
    native.write_json(
        directory / "RELEASE_MANIFEST.json",
        {
            "commit": native.BUILD_COMMIT,
            "reviewCommit": "review",
            "artifacts": artifacts,
            "status": "OK",
        },
    )
    if tamper == "artifact":
        assert native.verify_review(directory) is True
        installer.write_bytes(b"changed")
    assert native.verify_review(directory) is False
