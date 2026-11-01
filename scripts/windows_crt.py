"""Select and verify the minimal app-local CRT from the installed Microsoft redist."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PROVENANCE = ROOT / "services/pdf-engine/build/desktop-sidecar/crt-provenance.json"
CRT_NAME = re.compile(r"(?i)^(msvcp|vcruntime|concrt|vcomp|vccorlib)\d+[^/\\]*\.dll$")


def require(value: bool, message: str) -> None:
    if not value:
        raise ValueError(message)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def pe_info(data: bytes) -> dict:
    import pefile

    pe = pefile.PE(data=data)
    strings = {}
    for group in getattr(pe, "FileInfo", []):
        for item in group:
            for table in getattr(item, "StringTable", []):
                strings.update(
                    {
                        k.decode(): v.decode("utf-8", "replace")
                        for k, v in table.entries.items()
                    }
                )
    imports = {}
    for entry in [
        *getattr(pe, "DIRECTORY_ENTRY_IMPORT", []),
        *getattr(pe, "DIRECTORY_ENTRY_DELAY_IMPORT", []),
    ]:
        imports[entry.dll.decode().lower()] = [
            symbol.name.decode() if symbol.name else symbol.ordinal
            for symbol in entry.imports
        ]
    exports = set()
    for symbol in getattr(getattr(pe, "DIRECTORY_ENTRY_EXPORT", None), "symbols", []):
        exports.add(symbol.ordinal)
        if symbol.name:
            exports.add(symbol.name.decode())
    return {
        "machine": pe.FILE_HEADER.Machine,
        "version": strings.get("FileVersion"),
        "imports": imports,
        "exports": exports,
    }


def discover() -> dict:
    executable = shutil.which("vswhere") or str(
        Path(os.environ["ProgramFiles(x86)"])
        / "Microsoft Visual Studio/Installer/vswhere.exe"
    )
    instances = json.loads(
        subprocess.check_output(
            [
                executable,
                "-latest",
                "-products",
                "*",
                "-requires",
                "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
                "-format",
                "json",
                "-utf8",
            ],
            encoding="utf-8-sig",
        )
    )
    require(bool(instances), "Microsoft C++ Build Tools installation not found")
    instance = instances[0]
    require(
        instance.get("isComplete") is True and instance.get("isPrerelease") is False,
        "A complete non-preview Microsoft toolchain is required",
    )
    base = Path(instance["installationPath"]).resolve()
    defaults = base / "VC/Auxiliary/Build"
    toolset = (
        (defaults / "Microsoft.VCToolsVersion.default.txt")
        .read_text("utf-8-sig")
        .strip()
    )
    redist_version = (
        (defaults / "Microsoft.VCRedistVersion.default.txt")
        .read_text("utf-8-sig")
        .strip()
    )
    tools = Path(
        os.environ.get("VCToolsInstallDir", str(base / "VC/Tools/MSVC" / toolset))
    ).resolve()
    redist = Path(
        os.environ.get(
            "VCToolsRedistDir", str(base / "VC/Redist/MSVC" / redist_version)
        )
    ).resolve()
    require(
        tools.is_relative_to(base / "VC/Tools/MSVC") and tools.is_dir(),
        "VCToolsInstallDir outside the discovered Microsoft installation",
    )
    require(
        redist.is_relative_to(base / "VC/Redist/MSVC")
        and redist.is_dir()
        and "debug_nonredist" not in str(redist).lower(),
        "VCToolsRedistDir must belong to the official Microsoft redist",
    )
    candidates = list(redist.glob("x64/Microsoft.VC*.CRT"))
    require(
        len(candidates) == 1, "Expected one unambiguous x64 Microsoft CRT directory"
    )
    require(
        candidates[0].resolve().is_relative_to(redist),
        "CRT directory escaped the Microsoft redist",
    )
    return {
        "product": instance["productId"],
        "edition": instance["displayName"],
        "version": instance["installationVersion"],
        "channel": instance["channelId"],
        "installationPath": str(base),
        "toolset": tools.name,
        "architecture": "x64",
        "VCToolsInstallDir": str(tools),
        "VCToolsRedistDir": str(redist),
        "crtDirectory": str(candidates[0].resolve()),
        "terms": [
            "https://learn.microsoft.com/en-us/visualstudio/releases/2022/redistribution",
            "https://visualstudio.microsoft.com/license-terms/vs2022-ga-diagnosticbuildtools/",
            "https://learn.microsoft.com/en-us/cpp/windows/deployment-in-visual-cpp",
        ],
    }


def closure(infos: list[dict], official: dict[str, Path]) -> set[str]:
    needed = {
        name for info in infos for name in info["imports"] if CRT_NAME.fullmatch(name)
    }
    done = set()
    while needed - done:
        name = next(iter(needed - done))
        require(
            name in official,
            f"Required CRT not available in the selected redist: {name}",
        )
        info = pe_info(official[name].read_bytes())
        require(info["machine"] == 0x8664, f"CRT architecture is not x64: {name}")
        needed.update(dep for dep in info["imports"] if CRT_NAME.fullmatch(dep))
        done.add(name)
    return needed


def check_symbols(
    infos: list[dict], official: dict[str, Path], needed: set[str]
) -> None:
    exports = {name: pe_info(official[name].read_bytes())["exports"] for name in needed}
    for info in infos:
        for name, symbols in info["imports"].items():
            if CRT_NAME.fullmatch(name):
                require(
                    name in exports and set(symbols) <= exports[name],
                    f"CRT imports/exports incompatible: {name}; missing {set(symbols) - exports.get(name, set())}",
                )


def normalize(binaries: list[tuple[str, str, str]]) -> list[tuple[str, str, str]]:
    """Called by the tracked spec after Analysis, before EXE/PKG packing."""
    environment = discover()
    directory = Path(environment["crtDirectory"])
    official = {path.name.lower(): path.resolve() for path in directory.glob("*.dll")}
    remaining = [
        entry for entry in binaries if not CRT_NAME.fullmatch(Path(entry[0]).name)
    ]
    infos = [
        pe_info(Path(source).read_bytes())
        for _, source, kind in remaining
        if kind in {"BINARY", "EXTENSION"}
    ]
    needed = closure(infos, official)
    require(bool(needed), "No CRT detected in the Windows sidecar")
    check_symbols(
        infos + [pe_info(official[name].read_bytes()) for name in needed],
        official,
        needed,
    )
    files = []
    for name in sorted(needed):
        source = official[name]
        require(
            source.is_relative_to(directory), "CRT source escaped the official redist"
        )
        data = source.read_bytes()
        files.append(
            {
                "filename": name,
                "source": str(source),
                "version": pe_info(data)["version"],
                "bytes": len(data),
                "sha256": sha(data),
                "destination": name,
            }
        )
        remaining.append((name, str(source), "BINARY"))
    require(len({entry["version"] for entry in files}) == 1, "Mixed CRT file versions")
    PROVENANCE.parent.mkdir(parents=True, exist_ok=True)
    PROVENANCE.write_text(
        json.dumps(
            {
                "environment": environment,
                "files": files,
                "mechanism": "app-local; spec normalization before PKG; initial Analysis dependency search is not the final payload",
                "status": "OK",
            },
            indent=2,
        ),
        "utf-8",
    )
    return remaining


def verify_payload(
    sidecar: Path, provenance: Path = PROVENANCE, extra: list[Path] | None = None
) -> dict:
    from PyInstaller.archive.readers import CArchiveReader

    report = json.loads(provenance.read_text("utf-8"))
    actual_environment = discover()
    require(
        report["environment"] == actual_environment,
        "CRT provenance does not match the discovered toolchain",
    )
    directory = Path(actual_environment["crtDirectory"])
    files = {entry["filename"]: entry for entry in report["files"]}
    archive = CArchiveReader(str(sidecar))
    infos = []
    crt_entries = set()
    for name in archive.toc:
        if name.lower().endswith((".dll", ".pyd")):
            data = archive.extract(name)
            infos.append(pe_info(data))
            leaf = name.replace("\\", "/").rsplit("/", 1)[-1].lower()
            if CRT_NAME.fullmatch(leaf):
                require(
                    name.lower() == leaf and leaf in files,
                    f"Unexpected/nested CRT copy: {name}",
                )
                entry = files[leaf]
                source = Path(entry["source"]).resolve()
                require(
                    source.is_relative_to(directory)
                    and source == (directory / leaf).resolve(),
                    f"Forbidden CRT provenance: {source}",
                )
                require(
                    source.read_bytes() == data
                    and sha(data) == entry["sha256"]
                    and len(data) == entry["bytes"]
                    and pe_info(data)["version"] == entry["version"],
                    f"CRT package mismatch: {name}",
                )
                crt_entries.add(leaf)
    infos += [pe_info(path.read_bytes()) for path in [sidecar, *(extra or [])]]
    official = {path.name.lower(): path.resolve() for path in directory.glob("*.dll")}
    needed = closure(infos, official)
    require(
        crt_entries == set(files) == needed,
        f"Missing or unnecessary CRT: needed {needed}, packaged {crt_entries}",
    )
    require(
        len({entry["version"] for entry in files.values()}) == 1, "CRT versions differ"
    )
    check_symbols(infos, official, needed)
    return {
        **report,
        "sidecarSha256": sha(sidecar.read_bytes()),
        "importClosure": sorted(needed),
        "allImportsResolved": True,
        "noLegacyCrtCopies": True,
    }


def verify_loaded(worker_pid: int, sidecar: Path) -> dict:
    """Check the CRT actually loaded by this build's successful health process."""
    require(worker_pid > 0, "Invalid sidecar worker PID")
    command = f"(Get-Process -Id {int(worker_pid)}).Modules | Select-Object ModuleName,FileName | ConvertTo-Json -Compress"
    modules = json.loads(
        subprocess.check_output(
            ["powershell.exe", "-NoProfile", "-Command", command], encoding="utf-8"
        )
    )
    provenance = json.loads(PROVENANCE.read_text("utf-8"))
    expected = {entry["filename"]: entry for entry in provenance["files"]}
    found = []
    for module in modules:
        name = module["ModuleName"].lower()
        if CRT_NAME.fullmatch(name):
            require(
                name in expected
                and sha(Path(module["FileName"]).read_bytes())
                == expected[name]["sha256"],
                f"Loaded CRT differs from official package: {name}",
            )
            found.append(
                {
                    "filename": name,
                    "loadedPath": module["FileName"],
                    "sha256": expected[name]["sha256"],
                }
            )
    require(
        {entry["filename"] for entry in found} == set(expected),
        "Health process did not load every expected CRT",
    )
    result = {
        "sidecarSha256": sha(sidecar.read_bytes()),
        "health": "PASS",
        "runtimeCrt": found,
    }
    PROVENANCE.with_name("health-runtime-crt.json").write_text(
        json.dumps(result, indent=2), "utf-8"
    )
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument("--sidecar", type=Path)
    args = parser.parse_args()
    print(
        json.dumps(
            verify_payload(args.sidecar) if args.sidecar else discover(), indent=2
        )
    )
