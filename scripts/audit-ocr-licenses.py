"""Fetch pinned upstream notices for the existing MuPDF OCR implementation."""

from __future__ import annotations

import hashlib
import json
import importlib.metadata
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "services/pdf-engine/build/ocr/notices"
SOURCES = {
    "PyInstaller-COPYING.txt": "https://raw.githubusercontent.com/pyinstaller/pyinstaller/v6.16.0/COPYING.txt",
    "MuPDF-COPYING": "https://raw.githubusercontent.com/ArtifexSoftware/mupdf/1.26.3/COPYING",
    "MuPDF-gitmodules": "https://raw.githubusercontent.com/ArtifexSoftware/mupdf/1.26.3/.gitmodules",
    "Tesseract-version.h": "https://raw.githubusercontent.com/ArtifexSoftware/mupdf/1.26.3/scripts/tesseract/tesseract/version.h",
    "Tesseract-COPYING": "https://raw.githubusercontent.com/ArtifexSoftware/thirdparty-tesseract/a3a7bfaba8b1b575142f9752dba7540ac204f437/LICENSE",
    "Leptonica-version.h": "https://raw.githubusercontent.com/ArtifexSoftware/thirdparty-leptonica/0dc051249fa596016310e6d1509518fd34be4f63/src/environ.h",
    "Leptonica-COPYING": "https://raw.githubusercontent.com/ArtifexSoftware/thirdparty-leptonica/0dc051249fa596016310e6d1509518fd34be4f63/leptonica-license.txt",
}
HASHES = {
    "PyInstaller-COPYING.txt": "dcf75fdb959db1e3b41c0f8505069d2ece781b5ec6b3d0a4d30975cfc6580245",
    "MuPDF-COPYING": "57c8ff33c9c0cfc3ef00e650a1cc910d7ee479a8bc509f6c9209a7c2a11399d6",
    "MuPDF-gitmodules": "7582060bf69c641d58d666ebb75d785c8e9c841b3c8f43fd880bf004735fbf8e",
    "Tesseract-version.h": "87cdeb7763f7228bb69607fb404ffcfc93910b73f69d30b3466ee033fec51554",
    "Tesseract-COPYING": "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
    "Leptonica-version.h": "e0647bd3d736e302ba2c653789728d132160654be7bb58fe294488efb0653413",
    "Leptonica-COPYING": "87829abb5bbb00b55a107365da89e9a33f86c4250169e5a1e5588505be7d5806",
}


def main() -> None:
    DESTINATION.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for name, url in SOURCES.items():
        target = DESTINATION / name
        content = (
            target.read_bytes()
            if target.is_file()
            else urllib.request.urlopen(url, timeout=30).read()
        )
        if hashlib.sha256(content).hexdigest() != HASHES[name]:
            raise RuntimeError(f"Upstream notice checksum mismatch: {name}")
        target.write_bytes(content)
        manifest[name] = {
            "url": url,
            "sha256": hashlib.sha256(content).hexdigest(),
            "bytes": len(content),
        }
    (DESTINATION / "sources.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    print(json.dumps(manifest, indent=2))
    # The environment inventory is diagnostic, not a claim that every installed
    # package is in the frozen artifact. Preserve all supplied license texts.
    inventory = []
    for dist in importlib.metadata.distributions():
        name = dist.metadata["Name"]
        inventory.append(
            {
                "name": name,
                "version": dist.version,
                "license": dist.metadata.get("License-Expression")
                or dist.metadata.get("License"),
                "scope": "build environment",
            }
        )
        for entry in dist.files or []:
            if ".dist-info/" in entry.as_posix() and any(
                word in entry.name.upper() for word in ("LICENSE", "COPYING", "NOTICE")
            ):
                content = dist.locate_file(entry).read_bytes()
                (DESTINATION / f"{name}-{entry.name}").write_bytes(content)
    (DESTINATION / "python-environment.json").write_text(
        json.dumps({"python": sys.version, "packages": inventory}, indent=2),
        encoding="utf-8",
    )
    python_license = Path(sys.base_prefix) / "LICENSE.txt"
    if python_license.is_file():
        (DESTINATION / "Python-LICENSE.txt").write_bytes(python_license.read_bytes())


if __name__ == "__main__":
    main()
