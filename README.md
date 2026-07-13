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

### Export PDF organisé

Le mode **Organiser** du frontend envoie tous les PDF sources nécessaires et son
plan au backend via `POST /pdf/export/organize` en `multipart/form-data` :

- `files` : un ou plusieurs PDF sources ;
- `documentIds` : une chaîne JSON avec les IDs frontend, dans le même ordre que
  les fichiers ;
- `plan` : une chaîne JSON avec `outputName`, `saveToOutputDir` et une liste
  `pages` (`sourceDocumentId`, `sourcePageIndex` zéro-based, `rotation` à 0,
  90, 180 ou 270).

Exemple de plan :

```json
{
  "outputName": "fusion-modifiee.pdf",
  "saveToOutputDir": true,
  "pages": [
    { "sourceDocumentId": "doc-a", "sourcePageIndex": 0, "rotation": 0 },
    { "sourceDocumentId": "doc-b", "sourcePageIndex": 2, "rotation": 90 }
  ]
}
```

Le backend renvoie toujours le PDF généré pour téléchargement et ne modifie jamais
le fichier source. Avec `saveToOutputDir: false`, aucune écriture locale n'est
tentée. En développement, `saveToOutputDir: true` tente aussi une copie sécurisée
dans `/workspace/data/output`, crée le dossier si nécessaire et ajoute un suffixe
en cas de conflit. Si cette copie échoue, le téléchargement reste disponible et la
réponse contient l'avertissement `X-Pdf-Output-Warning`.

Avec plusieurs PDF ouverts, le panneau « Ajouter depuis un PDF ouvert » permet de
choisir un document puis certaines de ses pages. « Ajouter les pages sélectionnées »
ajoute les pages cochées à la fin, dans l'ordre croissant ; « Tout ajouter » ajoute
toutes les pages du PDF source à la fin. Elles restent ensuite réorganisables dans
la grille principale.

En web pur, le téléchargement navigateur est le comportement standard ; le choix
libre d'un dossier et un vrai « Enregistrer sous… » système seront traités plus
tard avec Tauri. `/workspace/data/output` est une sortie de développement.

Limites actuelles : pas encore de split avancé, d'OCR, ni d'édition de texte PDF.
