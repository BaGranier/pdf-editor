# AGENTS.md

## Project

PDF Studio Local is a local-first PDF editor available as a web application and
as a Tauri desktop application.

Current architecture:

- `apps/web`: React + Vite + TypeScript frontend;
- `apps/desktop`: Tauri v2 native shell and local backend lifecycle;
- `services/pdf-engine`: Python + FastAPI PDF engine;
- `data/input`: ignored local input documents;
- `data/output`: ignored local generated documents;
- `apps/web/e2e/fixtures`: synthetic, reproducible, versioned QA documents.

`packages/shared` is intentionally absent. Reintroduce a shared package only
when at least two runtime consumers can use the same generated or language-neutral
contract; Python and TypeScript models must not be duplicated there manually.

## Safety rules

- Work only inside `/workspace`.
- Do not modify files outside this repository.
- Do not access, inspect, or version personal files.
- Keep user-provided PDFs and office documents under ignored local directories.
- Only synthetic, reproducible QA documents may be committed as binary fixtures.
- Do not use danger-full-access.
- Do not mount or use the Docker socket.
- Do not commit secrets, tokens, API keys, environment files, or auth files.
- Do not add large binary files unless explicitly requested.
- Ask before adding new major dependencies.

## Functional scope

### Implemented and covered by automated tests

- open, display, navigate, and persist local PDF documents;
- display page thumbnails and manage multiple open documents;
- rotate, delete, duplicate, and reorder pages in UI state;
- compose and export mono-document or multi-document PDFs through FastAPI;
- add text blocks and signatures, then include them in PDF export;
- run local OCR and reopen the generated searchable PDF;
- convert PDF to DOCX, TXT, HTML, PNG, or JPEG;
- start the local FastAPI backend from the Tauri desktop shell.

### Experimental or fidelity-limited

- editable DOCX layout reconstruction for complex source documents;
- OCR recognition quality, output size, and performance on real-world scans;
- text placement when fonts or glyphs differ from the supported built-in fonts;
- desktop packaging of OCR and conversion system dependencies on every OS.

### Remaining work before a general desktop release

- native save dialogs and final destination management;
- PDF file association and operating-system “Open with” integration;
- native builds and installers validated on Windows, Linux, and macOS;
- Windows signing, macOS notarization, and application updates;
- focused modularization of the large frontend application and stylesheet.

### Explicitly out of scope

- cloud synchronization or remote document storage;
- user accounts, authentication, billing, or multi-user collaboration;
- server-hosted document processing;
- advanced split workflows, full PDF object editing, or arbitrary font embedding;
- guarantees of pixel-perfect editable DOCX conversion for complex layouts.

## Code style

TypeScript:

- strict mode;
- typed API clients;
- small components and domain-focused modules;
- Vitest unit tests and Playwright browser tests.

Python:

- type hints;
- Pydantic schemas;
- pytest tests;
- Ruff formatting and lint rules;
- no global mutable state.

## Commands to prefer

Frontend:

```bash
cd apps/web
npm ci
npm test -- --run
npm run build
npm run typecheck:e2e
npm run qa:e2e
```

Backend:

```bash
cd services/pdf-engine
uv sync --locked
uv run pytest
uv run ruff check .
```

Desktop:

```bash
cd apps/desktop
npm ci
npm run desktop:check
npm run desktop:dev
```
