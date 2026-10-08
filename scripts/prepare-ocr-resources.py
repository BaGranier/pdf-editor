"""Fetch only the pinned language data used by the integrated MuPDF OCR worker."""

from __future__ import annotations

import hashlib
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "services/pdf-engine/build/ocr"
REVISION = "87416418657359cb625c412a48b6e1d6d41c29bd"
BASE = f"https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/{REVISION}"
FILES = {
    "eng.traineddata": "7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2",
    "fra.traineddata": "ced037562e8c80c13122dece28dd477d399af80911a28791a66a63ac1e3445ca",
    "osd.traineddata": "9cf5d576fcc47564f11265841e5ca839001e7e6f38ff7f7aacf46d15a96b00ff",
    "LICENSE": "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
}


def prepare() -> Path:
    tessdata = DESTINATION / "tessdata"
    tessdata.mkdir(parents=True, exist_ok=True)
    manifest = {"revision": REVISION, "files": {}}
    for name, expected in FILES.items():
        target = tessdata / name
        content = (
            target.read_bytes()
            if target.is_file()
            else urllib.request.urlopen(f"{BASE}/{name}", timeout=60).read()
        )
        digest = hashlib.sha256(content).hexdigest()
        if digest != expected:
            raise RuntimeError(f"OCR resource checksum mismatch: {name}")
        target.write_bytes(content)
        manifest["files"][name] = {"sha256": digest, "bytes": len(content)}
    (DESTINATION / "manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    print(json.dumps(manifest, indent=2))
    return DESTINATION


if __name__ == "__main__":
    prepare()
