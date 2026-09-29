from __future__ import annotations

import runpy
import sys
from pathlib import Path

import pytest

from app import desktop_server
from app.conversion import worker


@pytest.mark.parametrize("conversion", [False, True])
def test_packaged_entrypoint_routes_only_explicit_worker_mode(
    monkeypatch: pytest.MonkeyPatch, conversion: bool
) -> None:
    arguments = ["pdf-engine.exe"]
    if conversion:
        arguments.append("--conversion-worker")
    arguments.extend(["--input", "synthetic.pdf"] if conversion else ["--port", "0"])
    monkeypatch.setattr(sys, "argv", arguments)
    observed: list[tuple[str, list[str]]] = []
    monkeypatch.setattr(
        worker, "main", lambda: observed.append(("worker", sys.argv[1:]))
    )
    monkeypatch.setattr(
        desktop_server, "main", lambda: observed.append(("server", sys.argv[1:]))
    )
    with pytest.raises(SystemExit):
        runpy.run_path(
            str(Path(__file__).resolve().parents[1] / "desktop_entrypoint.py"),
            run_name="__main__",
        )
    assert observed == [
        ("worker", ["--input", "synthetic.pdf"])
        if conversion
        else ("server", ["--port", "0"])
    ]
