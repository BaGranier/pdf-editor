# PDF Studio Local

Éditeur PDF local-first disponible dans un navigateur ou dans une application
desktop Tauri. Les documents restent sur la machine : le frontend communique
uniquement avec le moteur FastAPI local.

## Structure

- `apps/web`: Vite + React + TypeScript frontend
- `apps/desktop`: Tauri v2 native shell and local backend lifecycle
- `services/pdf-engine`: FastAPI backend
- `apps/web/e2e/fixtures`: fixtures QA synthétiques et versionnées
- `data/input`: documents d'entrée locaux, entièrement ignorés par Git
- `data/output`: documents générés localement, entièrement ignorés par Git

Le développement et le packaging natifs sont documentés dans
[DESKTOP.md](DESKTOP.md).

## Fonctionnalités

- ouverture, affichage, miniatures et navigation multi-document ;
- persistance locale des documents et préférences avec IndexedDB ;
- rotation, suppression, duplication et réorganisation des pages ;
- composition et export PDF mono-document ou multi-document ;
- ajout, déplacement et redimensionnement de textes et signatures ;
- OCR local en français, anglais ou mode mixte ;
- conversion en DOCX éditable ou visuel, TXT, HTML, PNG et JPEG ;
- exécution web ou desktop avec cycle de vie du backend géré par Tauri.

### Raccourcis clavier

Les commandes applicatives réutilisent les mêmes actions que les boutons. Le
modificateur principal est `Ctrl` sous Windows/Linux et `Cmd` sous macOS.

| Action | Windows / Linux | macOS | Web / Desktop |
| --- | --- | --- | --- |
| Ouvrir un PDF | `Ctrl+O` | `Cmd+O` | Web et Desktop |
| Enregistrer / Enregistrer sous | `Ctrl+S` / `Ctrl+Shift+S` | `Cmd+S` / `Cmd+Shift+S` | Web et Desktop ; le web ouvre le workflow de téléchargement |
| Fermer le document actif | `Ctrl+W` | `Cmd+W` | Desktop seulement ; respecte la confirmation d'état modifié |
| Annuler / Rétablir | `Ctrl+Z` / `Ctrl+Y` ou `Ctrl+Shift+Z` | `Cmd+Z` / `Cmd+Shift+Z` | Web et Desktop |
| Zoom | `Ctrl++`, `Ctrl+-`, `Ctrl+0` | `Cmd++`, `Cmd+-`, `Cmd+0` | Web et Desktop ; `+` accepte aussi `=` et le pavé numérique |
| Rechercher dans le document | `Ctrl+F` | `Cmd+F` | Web et Desktop ; la recherche est incrémentale et reste locale |
| Document suivant / précédent | `Ctrl+Tab` / `Ctrl+Shift+Tab` | `Ctrl+Tab` / `Ctrl+Shift+Tab` | Desktop seulement ; `Cmd+Tab` reste réservé au système macOS |
| Fermer l'overlay actif | `Escape` | `Escape` | Contextuel |

Les champs de saisie, `textarea`, `select` et éditeurs `contenteditable`
conservent leurs raccourcis natifs : copier/coller, tout sélectionner et undo
local ne déclenchent pas une commande documentaire.

### Modes de lecture

Le viewer propose trois modes complémentaires :

- **Continu** affiche toutes les pages avec défilement ;
- **Page unique** affiche une page, applique un ajustement automatique, conserve
  la page active entre les modes et laisse disponibles le zoom manuel et
  **Ajuster** ;
- **Présentation** demande le plein écran via l'API navigateur lorsqu'elle est
  disponible, sinon utilise toute la surface applicative. Elle n'affiche que le
  PDF et son fond, sans chrome d'édition.

En Page unique et Présentation, `ArrowLeft`/`PageUp` vont à la page précédente,
`ArrowRight`/`PageDown` à la suivante, `Home` à la première et `End` à la
dernière. En Présentation, `Space` avance et `Escape` revient à Page unique en
conservant la page active. Les miniatures et commentaires ouvrent la page ciblée.

La reconstruction DOCX éditable, la qualité OCR sur des scans réels et le
packaging desktop multi-plateforme restent soumis aux limites décrites dans
[CONVERSION.md](CONVERSION.md), [NATIVE_TEXT_EDITING.md](NATIVE_TEXT_EDITING.md), [DESKTOP.md](DESKTOP.md) et
[TECHNICAL_DEBT.md](TECHNICAL_DEBT.md).

## Frontend

```bash
cd apps/web
npm ci
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

### QA navigateur Playwright

La campagne reproductible Chromium + Firefox, ses prérequis, ses artefacts et les
contrôles restant manuels sont documentés dans
[QA_AUTOMATION.md](QA_AUTOMATION.md).

Commande complète depuis `apps/web` :

```bash
npm run qa:e2e
```

Commande rapide utilisée en CI :

```bash
npm run qa:e2e:quick
```

## Backend

```bash
cd services/pdf-engine
uv sync --locked
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Health check:

```bash
curl http://localhost:8000/health
```

### API locale

| Méthode et route | Rôle |
| --- | --- |
| `GET /health` | vérifier que le moteur local est prêt |
| `POST /pdf/export/organize` | composer, éditer et exporter un PDF |
| `POST /ocr` | produire un PDF local avec couche texte OCR |
| `POST /convert` | convertir un PDF en document ou en images |

Les trois routes de traitement utilisent `multipart/form-data`. Les fichiers
sources ne sont jamais modifiés ; les résultats sont renvoyés comme
téléchargements et peuvent être rouverts dans l'application.

### OCR local

L'action **OCR** produit un nouveau PDF recherchable sans fermer ni modifier le
document source. Elle accepte `fra`, `eng` et `fra+eng`, avec correction
d'inclinaison optionnelle. OCRmyPDF, Tesseract, Ghostscript et QPDF doivent être
installés sur la machine. Les erreurs de dépendance ou de PDF invalide sont
renvoyées avec des codes métier stables.

### Conversion locale

L’action **Convertir** conserve le PDF source ouvert et télécharge le résultat
sans l’ajouter au viewer. Elle prend en charge DOCX, TXT UTF-8, HTML autonome,
PNG et JPEG via `POST /convert`. Pour DOCX, TXT et HTML, le mode OCR automatique
réutilise l’OCR existant uniquement sur les pages sans couche texte exploitable.

Les formats, options multipart, limites de sécurité, dépendances OCR et limites
de fidélité sont détaillés dans [CONVERSION.md](CONVERSION.md).

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
le fichier source. Après un export réussi, le frontend ouvre aussi ce PDF comme un
nouveau document interne en mode lecture, sans fermer les documents sources. Avec
`saveToOutputDir: false`, aucune écriture locale n'est tentée. En développement,
`saveToOutputDir: true` tente aussi une copie sécurisée
dans `/workspace/data/output`, crée le dossier si nécessaire et ajoute un suffixe
en cas de conflit. Si cette copie échoue, le téléchargement reste disponible et la
réponse contient l'avertissement `X-Pdf-Output-Warning`.

Avec plusieurs PDF ouverts, le panneau « Ajouter depuis un PDF ouvert » permet de
choisir un document puis certaines de ses pages via des miniatures au rendu
progressif. « Ajouter les pages sélectionnées » ajoute les pages cochées à la fin,
dans l'ordre croissant ; « Tout ajouter » ajoute toutes les pages du PDF source à la
fin. Elles restent ensuite réorganisables dans la grille principale.

Les blocs de texte et signatures ajoutés dans l'interface sont inclus dans le
plan d'export. Le frontend conserve un historique local pour les interactions
d'édition prises en charge, et le backend signale les éventuels débordements de
texte sans altérer les PDF sources.

En web pur, le téléchargement navigateur est le comportement standard ; le choix
libre d'un dossier et un vrai « Enregistrer sous… » système seront traités plus
tard avec Tauri. `/workspace/data/output` est une sortie de développement.

### Limites d'usage recommandées

Le frontend avertit sans bloquer l'ouverture ou l'export au-delà de **50 Mo** par
PDF, **250 pages** par PDF ou **8 documents ouverts**. Ces valeurs sont des
recommandations de mémoire et de quota navigateur, configurables au build par
`VITE_PDF_RECOMMENDED_MAX_SIZE_MB`, `VITE_PDF_RECOMMENDED_MAX_PAGE_COUNT` et
`VITE_PDF_RECOMMENDED_MAX_OPEN_DOCUMENTS`. En cas d'échec IndexedDB, les PDF
peuvent rester ouverts pour la session mais ne seront pas forcément restaurés
après fermeture de l'onglet.

Les fixtures reproductibles versionnées sont dans `apps/web/e2e/fixtures`. Les
documents complémentaires placés dans `data/input` restent locaux et ignorés par
Git. La campagne manuelle est décrite dans
[QA_BROWSER_CHECKLIST.md](QA_BROWSER_CHECKLIST.md).

Limites actuelles : pas de split avancé ni d'édition arbitraire des objets PDF
existants. L'édition ajoute des blocs de texte et des signatures lors de
l'export ; elle ne remplace pas une suite PAO complète. La conversion DOCX
reconstruit un document éditable sans garantir une reproduction parfaite des
mises en page complexes.

## Application desktop

```bash
cd apps/desktop
npm ci
npm run desktop:dev
```

Le shell Tauri démarre le frontend et un backend FastAPI sur un port loopback
dynamique. La configuration, les prérequis système, le build du sidecar et les
limites de packaging sont détaillés dans [DESKTOP.md](DESKTOP.md).

Pour valider la configuration desktop :

```bash
cd apps/desktop
npm run desktop:check
```
