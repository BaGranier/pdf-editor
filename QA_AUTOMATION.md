# QA opérationnelle

Ce document décrit les procédures actuelles, sans conserver les résultats de
campagnes passées. Utiliser des fixtures synthétiques ; documents et artefacts
locaux restent ignorés. Les gates ouvertes sont dans [NEXT_STEPS.md](NEXT_STEPS.md).

## Installation et tests de base

Depuis la racine :

```bash
uv sync --directory services/pdf-engine --locked
npm ci --prefix apps/web
npm ci --prefix apps/desktop
cd apps/web
PLAYWRIGHT_BROWSERS_PATH=../../.playwright-browsers \
  npx playwright install chromium firefox
```

Sur Linux, `npx playwright install --with-deps chromium firefox` peut installer
les dépendances système nécessaires. La campagne Web requiert aussi
OCRmyPDF/Tesseract/Ghostscript, langues eng/fra ; QPDF et LibreOffice servent aux
validations PDF/DOCX. Voir [DEVELOPMENT.md](DEVELOPMENT.md) et
[DESKTOP.md](DESKTOP.md) pour le runtime gelé et les prérequis natifs.

```bash
cd services/pdf-engine
uv run pytest
uv run ruff check .
```

```bash
cd apps/web
npm test -- --run
npm run lint
npm run build
npm run typecheck:e2e
npm run qa:e2e:quick
```

## Campagnes navigateur

Pour un clone neuf, préparer les assets volumineux d'intégration avec
`scripts.generate-clean-integration-fixtures` (commande ci-dessous) avant la
campagne complète ou un run qui inclut `clean-integration.spec.ts`.

Depuis `apps/web` :

```bash
npm run qa:e2e                 # complète, y compris @slow et contrôle DOCX visuel
npm run qa:e2e:quick           # exclut @slow et le contrôle DOCX visuel séparé
npm run qa:e2e:chromium
npm run qa:e2e:firefox
npm run qa:e2e:headed
npm run qa:e2e:debug
```

Le runner vérifie les services sur 5173/8000, nettoie les anciens résultats,
génère les fixtures puis lance Playwright et le résumé. Les services locaux
attendus peuvent être réutilisés ; un service inattendu arrête la campagne.
Playwright démarre Vite/FastAPI si nécessaire et arrête ceux qu'il a démarrés.

| Variable | Usage |
| --- | --- |
| `PLAYWRIGHT_BROWSERS_PATH` | Navigateurs locaux ; le runner détecte aussi `.playwright-browsers` |
| `QA_SKIP_WEBSERVERS=1` | Services déjà lancés ; désactive démarrage et vérification initiale des ports |
| `QA_BASE_URL`, `QA_BACKEND_URL` | URL des services ; les commandes de démarrage restent sur 5173/8000, utiliser le mode services existants pour d'autres ports |
| `QA_WORKERS` | Un worker par défaut ; concurrence volontaire pour diagnostic |
| `QA_SKIP_LARGE=1` | Évite la génération du gros PDF, ne désactive pas les tests qui le requièrent |
| `QA_REQUIRE_DOCX_VISUAL=1` | Rend l'absence/échec du contrôle LibreOffice bloquant pour la campagne complète |

Pour une gate complète avec fidélité DOCX :

```bash
QA_REQUIRE_DOCX_VISUAL=1 npm run qa:e2e
```

Un run direct `npx playwright test` ne régénère pas les fixtures ni le résumé
Markdown. Préférer le runner pour filtrer une régression :

```bash
npm run qa:e2e -- e2e/specs/clean-integration.spec.ts \
  e2e/specs/editor-export-presentation.spec.ts e2e/specs/storage-upgrade.spec.ts
```

Les fixtures volumineuses d'intégration ne sont pas créées par le runner standard :
exécuter d'abord, depuis la racine :

```bash
uv run --project services/pdf-engine python -m scripts.generate-clean-integration-fixtures
```

## Fixtures et sentinelles

Depuis la racine :

```bash
uv run --project services/pdf-engine python -m scripts.generate-qa-pdfs
uv run --project services/pdf-engine python -m scripts.generate-qa-pdfs --include-large
uv run --project services/pdf-engine python -m scripts.generate-qa-pdfs --french-only
```

Les petites fixtures sont dans `apps/web/e2e/fixtures`. Le gros PDF de 250 pages,
plus de 50 Mo, et les images/scans d'intégration sous `data/output/windows-qa-004`
restent ignorés. Les scripts n'utilisent aucun document personnel.

| Domaine modifié | Sentinelles à rejouer dans Chromium et Firefox |
| --- | --- |
| Documents/persistance | `password-protection`, `pdf-opening`, `document-navigation`, `persistence`, `storage-upgrade`, `multi-document` |
| Viewer/layout | `viewer-modes`, `viewer-page-transition`, `ui-workspace-responsive`, `zoom-and-scroll` |
| Sauvegarde/export | `save-editing`, `export`, `organize-pages`, `editor-export-presentation` |
| Édition/composition | `text-editing`, `native-text-editing`, `shape-editing`, `freehand-controls`, `text-markup`, `comments`, `clean-integration` |
| OCR/conversion | `ocr-orientation`, `ocr`, `conversion`, `conversion-docx-regression` |
| Forms/impression/accessibilité | `pdf-forms`, `print-workflow`, `accessibility-smoke`, `keyboard-navigation`, `shortcuts-audit` |

Les noms correspondent aux fichiers `apps/web/e2e/specs/*.spec.ts`.
Pour une extraction frontend : tests unitaires, lint/build/typecheck E2E,
sentinelles du domaine et campagne rapide transverse. Après déplacement CSS
transversal, exécuter la complète. Toucher export/OCR/conversion demande aussi
pytest ; toucher le pont desktop demande `desktop:check` et une QA native ciblée.

Les tests `QA-E2E-015`/`PERF-MEMORY-002` contrôlent gros PDF, cycles open/close,
ressources DOM et IndexedDB. Le heap JS Chromium ne mesure pas la RAM totale/GPU ;
Firefox n'offre pas la même métrique. Les tests de composition couvrent ordre/alpha
et pixels PDF ; ils ne remplacent pas toute la qualification de scène native.

## PDF protégés et scans orientés

Le petit corpus versionné se régénère sans document personnel :

```bash
uv run --project services/pdf-engine python -m scripts.generate-protection-ocr-fixtures
uv run --project services/pdf-engine python -m scripts.prepare-ocr-resources
uv run --project services/pdf-engine python -m scripts.measure-ocr-orientation
cd services/pdf-engine
uv run pytest tests/test_passwords.py tests/test_ocr_orientation.py tests/test_ocr_runtime.py -s
```

Les identifiants de la fixture protégée sont exclusivement synthétiques :
`synthetic-open` et `synthetic-owner`. La génération reproduit le contenu ; le
chiffrement emploie des valeurs aléatoires, donc les octets ne sont pas identiques.
`test_ocr_orientation` mesure chaque cas et compare deskew activé/désactivé ; absence
d’OCRmyPDF ou de ressources préparées est un skip explicite, pas une qualification.
Les E2E `password-protection` et `ocr-orientation` tournent dans Chromium/Firefox :
annulation/retry/rendu/restauration sans secret et OCR réel du scan tourné.
Les anciennes sentinelles ouverture/sauvegarde restent nécessaires.

Rejouer sur l’artefact Windows final : sélection via dialogue natif puis prompt
applicatif, association OS d’un PDF protégé, mauvais mot de passe/annulation/retry,
édition/undo/redo, Save As non chiffré et export avec un nouveau mot de passe,
OCR packagé eng/fra/mixte et rotations offline, ressources absentes, fermeture
pendant traitement, crash du worker/backend puis retry. Le prompt de mot de passe
est React ; Playwright ne qualifie pas les dialogues natifs de fichiers.

## Composition globale, assets et robustesse Web

Corpus synthétique borné, généré sous `data/output/editor-robustness-008` et ignoré :
20 PNG/JPEG distincts (≈19,2 Mo), deux images de plus de 2 Mpx, transparence,
scène PDF/JSON avec texte source, highlight, deux images dont crop, rectangles
opaque/alpha, ellipse, trait, flèche, dessin, commentaire, signature et AcroForm.
Aucun asset volumineux n’est versionné.

```bash
# Racine du dépôt
uv run --project services/pdf-engine python -m scripts.editor-robustness-fixtures
uv run --project services/pdf-engine python -m scripts.profile-editor-robustness
uv run --project services/pdf-engine python -m scripts.qualify-editor-compression
uv run --project services/pdf-engine python -m scripts.qualify-docx-linux
```

Depuis `apps/web`, exécuter dans les deux navigateurs, sans retry :

```bash
PLAYWRIGHT_BROWSERS_PATH=../../.playwright-browsers npx playwright test \
  e2e/specs/global-composition.spec.ts e2e/specs/asset-stress.spec.ts \
  e2e/specs/web-storage-robustness.spec.ts e2e/specs/web-restoration-extremes.spec.ts \
  e2e/specs/accessibility-robustness.spec.ts e2e/specs/storage-upgrade.spec.ts \
  e2e/specs/shortcuts-audit.spec.ts e2e/specs/viewer-page-transition.spec.ts \
  --project=chromium --project=firefox --retries=0
```

Les helpers préparent le petit corpus d’assets si absent. Le scénario gros PDF
requiert aussi `scripts.generate-qa-pdfs --include-large` (250 pages / 51 Mio).
Le stress, marqué `@slow`, effectue trois cycles comparables : 20 assets, 26
instances par copie/réimport dédupliqué, 20 déplacements, 20 redimensionnements,
10 crops, 30 undo/redo, plans, suppression/undo, deux exports puis
fermeture des résultats et de la source, dans la même instance React sans reload
entre cycles. Les exports ouverts servent aussi de
changements de document ; zoom/scroll sont exercés après retour à la source.

La composition vérifie quatre déplacements de plan et alpha 0/25/50/75/100 %.
42 sondes de couleur en coordonnées PDF comparent chaque capture du viewer au
rendu PyMuPDF de la sortie (écart maximal de 18 par canal pour les rasteriseurs).
Les sorties sont aussi rouvertes avec PDF.js et pypdf ; texte sélectionnable,
vecteurs, commentaire masqué/métadonnées et AcroForm sont contrôlés. Les objets
ajoutés suivent `PdfEdit[]` ; texte natif/formulaires restent dans leurs couches
source. Le marqueur local du commentaire utilise la même géométrie et couleur
fixe dans le viewer et le PDF ; les annotations importées gardent leur UI dédiée.

Les tests stockage injectent `QuotaExceededError` et abortent la transaction ;
le remplissage durable est borné à 2 Mio, sans saturer le disque. Ils vérifient
version de repli la plus récente, assets, avertissement/récupération et absence
de copie fantôme après fermeture. Une fermeture réelle de navigateur avec profil
isolé contrôle deux documents, crop, dirty state et assets partagés ; les cas
métadonnées de viewport absentes, asset manquant et migration v1→v2 sont séparés.
Une signature dont l’asset manque bloque l’export comme une image manquante.

Les pièces jointes Playwright consignent assets/instances, taille logique des
assets, estimation de stockage du navigateur, canvases, exports et heap JS.
Chromium expose aussi les mesures CDP après GC ; le heap de la page exclut
workers PDF.js, GPU et mémoire native. Firefox conserve `null` pour le heap
indisponible. `backend-cycles.json` mesure RSS courant, pic RSS, CPU et descripteurs
Linux sur six cycles ; ce ne sont pas des métriques Windows. Le diagnostic
`profile-editor-robustness --native-rewrite-only` reproduit la croissance native
sans exporteur applicatif ; `--diagnose-native --quality balanced --no-render`
isole recompression/allocateur. Ces nettoyages sont uniquement diagnostiques.
La limite encore active est détaillée dans [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md).

Contraste sombre : couleurs calculées avec composition des fonds, ratios de
luminance ciblés toolbar, menu, palette, inspector, dialogue et erreur ; seuil
texte 4,5:1, anneau de focus 3:1. L’opacité et le contraste des états désactivés
sont consignés séparément. Références : [contraste du texte](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
et [contraste non textuel](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast).
Les tests couvrent Tab/Shift+Tab, Enter/Space, Escape,
sliders, retour au déclencheur et présentation ; aucun redesign global.

Compression : cinq corpus (texture photographique synthétique, scan, texte,
vecteurs et transparence), trois profils, tailles, rendu échantillonné, texte,
vecteurs et masques alpha vérifiés. Un profil peut agrandir un scan déjà très
compressible : aucune garantie de taille décroissante pour tout PDF. DOCX :
LibreOffice headless contrôle accents, images, tableau simple et multipage ;
`scripts.validate-docx-visual-quality --required` complète la comparaison visuelle.
Word/Acrobat, impression produite et mémoire/handles WebView2 restent à qualifier.

## Résultats et contrôle visuel

Artefacts ignorés : `apps/web/test-results/results.json`, `playwright-report/`,
`artifacts/`, captures/traces/vidéos et `docx-visual-quality/` ; résumé racine
`QA_AUTOMATED_REPORT.md`. Le runner remplace les résultats précédents. Le résumé
porte hash Git, état du worktree et empreinte de l'état testé ; il ne certifie
pas un commit postérieur ou un installateur. Erreurs console/réseau et HTTP >=500
sont collectées ; réserves/skips doivent rester visibles.

```bash
# Depuis apps/web
npm run qa:report
npm run qa:e2e:report
npm run qa:docx-visual
npm run qa:e2e:update-snapshots -- --grep @visual
```

Les références visuelles sont séparées par navigateur, tolérance
`maxDiffPixelRatio: 0.02`. Les mettre à jour uniquement après revue.
`qa:docx-visual` utilise `--required` : LibreOffice indisponible est un échec,
pas une validation visuelle réussie.

Tests DOCX locaux optionnels : `QA_REAL_DOCX_PDF` ou `QA_COVER_PAGE_PDF` active
explicitement un document autorisé sous `data/input`. Depuis `services/pdf-engine`,
exécuter `uv run pytest -m docx_real_document` ou `uv run pytest -m docx_cover_page`
après définition de la variable correspondante. Sans variable, le test est ignoré ;
ne pas parcourir les documents privés pour choisir une entrée. Les résultats
restent sous `data/output`/`test-results`, sans texte privé versionné.

## Qualification native Windows

WSL et Playwright Web ne qualifient ni la WebView2 installée, ni les dialogues
système, ni l'installateur. Construire avec `desktop:check` et `desktop:build`
sur Windows, puis utiliser une installation QA isolée sous le dépôt.
Les helpers ciblent une seule instance et des chemins du dépôt ; les dialogues
pilotés supposent Windows français. Un résultat sur poste dev avec PATH isolé
ne remplace pas une VM réellement clean.

Depuis la racine dans PowerShell (Node 22 disponible) :

```powershell
uv run --project services/pdf-engine python -m scripts.generate-clean-integration-fixtures
./scripts/windows-qa-environment.ps1 -Output data/output/windows-qa-004/environment.json
./scripts/windows-clean-qa.ps1 -Action Install
./scripts/windows-clean-qa.ps1 -Action Launch
$env:PDF_STUDIO_QA_OUTPUT = 'data/output/windows-qa-004'
node scripts/windows-qa-cdp.cjs startup
node scripts/windows-qa-cdp.cjs metrics
node scripts/windows-qa-cdp.cjs files
node scripts/windows-qa-cdp.cjs integration-004
./scripts/windows-clean-qa.ps1 -Action Close
```

`windows-clean-qa.ps1` cible le NSIS **0.1.0 x64** au chemin de build actuel,
installe dans `data/output/windows-qa-004/installation été QA` et lance avec
PATH Windows seul, profil WebView2/temp QA et CDP loopback 9222. Adapter ce chemin
si la version de build change ; le JSON d'installation est marqué poste dev.
`files` utilise les vrais dialogues, annulation, destination Unicode et overwrite.
`integration-004` couvre crop/resize, assets partagés, profils et mémoire.

Fermer et relancer avec la fixture adaptée entre scénarios :

```powershell
./scripts/windows-clean-qa.ps1 -Action Launch -Pdf apps/web/e2e/fixtures/conversion-scan.pdf
node scripts/windows-qa-cdp.cjs ocr-eng
./scripts/windows-clean-qa.ps1 -Action Close
./scripts/windows-clean-qa.ps1 -Action Launch -Pdf apps/web/e2e/fixtures/conversion-scan-french.pdf
node scripts/windows-qa-cdp.cjs ocr-fra
./scripts/windows-clean-qa.ps1 -Action Close
```

Autres pilotes disponibles : `editor-004` (plans/formes/AES), `presentation-004`
(slides/fullscreen), `ocr-multipage`, `ocr-close-004`, `ocr-errors-004`, `idle-004`,
`retry`, `conversion`, `print`, `stress`. Lire les fixtures/préconditions dans
[scripts/windows-qa-cdp.cjs](scripts/windows-qa-cdp.cjs) avant invocation.
`ocr-errors-004` altère puis restaure uniquement les ressources extraites QA ;
les anciens scénarios d'absence des outils PATH ne s'appliquent pas au sidecar gelé.
`print` contrôle une demande d'impression, pas une sortie OS réellement produite.

```powershell
./scripts/windows-qa-processes.ps1 -Action Snapshot
./scripts/windows-qa-processes.ps1 -Action KillWorker
./scripts/windows-clean-qa.ps1 -Action Crash
./scripts/windows-clean-qa.ps1 -Action Inspect
./scripts/windows-clean-qa.ps1 -Action Uninstall
```

Le collecteur de processus relève private bytes, working set, handles, CPU cumulé,
descendants et ports, en tenant compte des dates de création des PID.
`windows-qa-performance.ps1 -Executable <chemin relatif de l'exécutable QA>`
mesure cinq lancements (configurable avec `-Repetitions`) ; retirer
`PDF_STUDIO_QA_OUTPUT` avant ce pilote, qui lit/écrit dans
`data/output/windows-qa-002`. Ces suffixes sont des conventions de scripts,
pas des rapports actifs. `windows-qa-validate.py` valide également les artefacts
au chemin fixe `windows-qa-002` ; pour une sortie ailleurs, utiliser
`validate-qa-pdf.py <pdf>` ou `validate-conversion-output.py <artefact> --format <format>`.
`measure-editor-export.py` mesure les profils dans `data/output/editor-export-003`.

## Contrôles humains et gates de release

Statuts : OK exécuté/conforme ; KO échec ; R régression ; NT non testé ; ENV
empêché par l'environnement ; AUTO preuve automatisée ; PARTIAL portée incomplète.
Conserver versions, commit/empreinte, installateur, OS, écrans/work area/DPI,
fixture, étapes, résultat attendu/observé et preuves dans les artefacts ignorés.
Ne pas convertir un skip ou un outil absent en résultat vert.

Avant release : exécuter la complète Web, pytest/Ruff, Rust au MSRV et build natif ;
installer l'artefact final sur VM clean et couvrir les P0 de
[NEXT_STEPS.md](NEXT_STEPS.md). Examiner notamment :

- netteté/alignement HiDPI, portrait/paysage, menus/poignées, resize/fullscreen,
  transitions multi-écran et Échap ;
- fichiers natifs, fermeture dirty, source intacte après erreur, droits/chemins,
  lancement menu/raccourci et association `.pdf` ;
- OCR offline, ressources manquantes, retry/crash, fermeture pendant traitement,
  zéro descendant/port après arrêt ;
- impression avec sortie réellement produite, AcroForms/annotations sous lecteur
  tiers, DOCX dans Word/LibreOffice et qualité des profils de compression ;
- installation/upgrade/désinstallation, WebView2 absent/offline et notices du package.

Le workflow CI général couvre web/backend ; le workflow navigateur est rapide
sur PR et propose une complète avec DOCX visuel requis ; le workflow desktop
contrôle Linux/Rust 1.88. Aucun ne constitue une qualification Windows native.
