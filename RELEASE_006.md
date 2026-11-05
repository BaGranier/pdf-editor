# RELEASE-006 — final Windows candidate

Decision: **PASS — FINAL CANDIDATE FOR CLEAN VM**.
Version: 0.1.0, Windows x64 NSIS, unsigned. Clean-VM validation has **not** been executed.

Build commit: `24dd8a9c7e6e0c060d808a3320bb9b606d86df63`.
Includes `e75fac8` (DESKTOP-005). Subsequent release documentation is identified
separately by `reviewCommit`; it does not change the compiled sources.

Tauri **2.12.5**, single-instance **2.5.5**, Rust minimum **1.90**;
compiler used: **rustc 1.98.1**, Cargo 1.98.1. CLI 2.11.4 and frontend API 2.11.1
are independently versioned; the installed native IPC and release build passed.
CI remains pinned to Rust 1.90.0. Lockfiles were used.

## Deliver this kit

All paths below are under `data/output/release-006/`:

- `PDF Studio Local_0.1.0_x64-setup.exe` — **59,812,843 bytes**.
- NSIS SHA-256: `b791da13feab982b07d1f9c203cc6ab58daccb4a2d474e567827323179ce8908`.
- `PDF-Studio-Local_0.1.0_24dd8a9c7e6e_sources.zip` — application tree from
  `git archive BUILD_COMMIT`, plus the required upstream sources.
- `THIRD_PARTY_NOTICES.zip` — current notices and release documentation.
- `RELEASE_MANIFEST.json` — authoritative filenames, sizes, hashes and build identity.
- `PACKAGE_VERIFICATION.json` — exact installer/package/installed qualification evidence.
- `component-inventory.json` — 139 sidecar archive entries, 1018 Python modules,
  installed resources and byte comparisons.

Deliver sources and notices alongside the installer. Never substitute an older
installer with the same filename. **No NSIS rebuild occurred after qualification.**

MVP-002, MVP-003 and MVP-004 are **HISTORICAL / DO NOT TEST**. Their installers
and evidence remain available. Previous compilation outputs and the previous QA
installation were preserved under `historical-build/` before rebuilding/installing.
The MSI produced by the build is secondary and is not the final clean-VM candidate.

## Gates

`npm --prefix apps/web run qa:mvp`: **exit 0**, `MVP PARTAGEABLE`.
Evidence: `data/output/mvp-gate/20261105T155837Z/results.json`.

| Gate | Result |
|---|---|
| Frontend | 365 tests; lint, E2E types and production build PASS |
| Backend MVP | 272 tests PASS |
| Bundled OCR | 18 tests PASS |
| Chromium / Firefox | 40 + 40 PASS; zero skipped/flaky |
| Rust | 15 PASS |
| Desktop source/package | PASS |
| Installed native evidence | PASS, tied to this executable, sidecar and web hashes |
| `release:verify` | exit 0 |

The complete rebuild regenerated the sidecar, fonts/OCR resources, notices,
frontend, Rust release executable and NSIS. No application functionality changed.
The fixture-count sentinel was corrected for the extra DESKTOP-005 fixture;
the gate now includes `desktop-polish` and the new installed checks.

The native audit verifies the official app-local CRT **14.44.35211.0**, MuPDF
**1.26.3**, and the new WebView2 SDK loader **1.0.3800.47** / bindings **0.39.1**.
All 263 inventory rows are resolved. WebView2 remains Evergreen via
`downloadBootstrapper`; no offline runtime is bundled.

## Installed Windows qualification

- Explorer actual folder selection/default shell activation: cold start with
  three PDFs gives **one process/window and three documents**. Opening two more
  restores the minimized window, focuses it and gives five documents.
- Reopening `b.pdf` activates its existing tab; document count remains five.
- Explorer file-item default action, equivalent to double-click: one PDF opens
  while closed; a second activation reaches the running instance. The effective
  Windows association was checked against the installed executable, not inferred
  from a registry declaration. Evidence: `explorer-*.json`, `association-*.json`.
- Windows Settings changed the **real monitor scale to 125%**. The monitor API
  confirmed 125 and the installed WebView reported DPR **1.25**, without a forced
  device scale. Zoom **50/75/100**, search, text selection, shape/overlay alignment
  after resize, palette and graphic signature passed. Also repeated at real 100%.
- File menu: normal, narrow, low and right-edge placements; full bounds inside
  the WebView, Escape, outside click and enabled keyboard navigation passed.
- The vector-text landscape witness allows an exact 75% page fit inside the
  physical 1920×1080 display at 125%; screenshot/bitmap metrics are in
  `polish-125.json` and `polish-100.json`.
- Edge comparison at matching CSS page sizes: `edge-125-matched-*.png` versus
  `installed-125-zoom-*.png`. No conspicuous low-zoom blur or geometry drift was
  observed; this is not a pixel-perfect comparison.
- Save As, direct Save, source preservation and reopening passed. Four synthetic
  Save boundary cases confirm the **25 MiB** policy, including a valid save above
  24 MiB and refusal above 25 MiB before native IPC.
- English and French bundled OCR produce reopened searchable PDFs; the French
  single-CDP witness completed/reopened in approximately 0.5 seconds. Earlier
  synchronous multi-CDP helper timeouts are retained as diagnostics and were
  superseded by the complete single-client verification (`fra-completion.json`).
- Closing and relaunching were exercised by the independent installed Explorer
  cases. No user document was used; only synthetic QA documents were processed.

Native evidence: `native-mvp.json`, `reports/`, `polish-*.json`, screenshots and
Save boundary JSON. The gate captured a transient Cargo.toml line-ending/stat
change made by the CLI; its canonical Git diff and build-provenance tracked
changes are empty. The file index was refreshed without a source change.

The original **100% scale and Edge PDF default were restored**. Temporary
per-app WebView test overrides were removed; see `system-restoration.json`.

## Remaining action

**Human validation of this exact candidate on a clean Windows VM.** No further
MVP preparation ticket is required. Authenticode signing remains outside the MVP.
