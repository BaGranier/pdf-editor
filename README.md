# PDF Editor MVP

Local-first web MVP for a PDF editor.

## Structure

- `apps/web`: Vite + React + TypeScript frontend
- `services/pdf-engine`: FastAPI backend
- `packages/shared`: shared schemas and types
- `data/input`: sample PDFs
- `data/output`: generated PDFs

## Frontend

```bash
cd apps/web
npm install
npm run dev -- --host 0.0.0.0
```

Build and type-check:

```bash
cd apps/web
npm run lint
npm run build
```

Run tests:

```bash
cd apps/web
npm run test
npm run test:run
```

## Backend

```bash
cd services/pdf-engine
uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Health check:

```bash
curl http://localhost:8000/health
```
