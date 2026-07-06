# AGENTS.md

## Project

This project is a local-first web MVP for a PDF editor.

Target architecture:
- apps/web: React + Vite + TypeScript
- services/pdf-engine: Python + FastAPI
- packages/shared: shared schemas and types
- data/input: sample PDFs
- data/output: generated PDFs

## Safety rules

- Work only inside /workspace.
- Do not modify files outside this repository.
- Do not access personal files.
- Do not use danger-full-access.
- Do not mount or use the Docker socket.
- Do not commit secrets, tokens, API keys or auth files.
- Do not add large binary files unless explicitly requested.
- Ask before adding new major dependencies.

## Current MVP scope

Implement first:
- open a PDF
- display pages
- page thumbnails
- rotate pages in UI state
- delete pages in UI state
- reorder pages
- export through the Python backend

Do not implement yet:
- OCR
- file conversion
- text editing
- signatures
- cloud sync
- user accounts

## Code style

TypeScript:
- strict mode
- typed API clients
- small components

Python:
- type hints
- pydantic schemas
- pytest tests
- no global mutable state

## Commands to prefer

Frontend:
- npm install
- npm run dev
- npm run lint
- npm run build

Backend:
- python -m venv .venv
- pip install -r requirements.txt
- pytest