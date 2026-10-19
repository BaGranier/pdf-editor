# Campagne QA navigateur automatisée

## Gate release Windows 006

Décision : **NOT READY**. Voie AGPL approuvée ; notices transitives et livraison
des sources restent incomplètes. VM clean indisponible, confirmée par
l'utilisateur. Les résultats 002/004 restent historiques. Les nouvelles preuves
sont ignorées sous `data/output/release-gate-006/` : inventaire, hashes,
environnement, logs et matrice. `NEXT_STEPS.md` conserve seulement les blockers.

Statuts de cette campagne : `OK` (exécuté nativement, environnement indiqué),
`KO`, `R`, `NT`, `ENV`, `AUTO`, `PARTIAL`. `AUTO` ne vaut jamais `OK` natif ;
un `OK` sur poste dev n'est pas un `OK` VM clean. Le bootstrapper WebView2 absent
et le réseau coupé doivent être éprouvés sur VM ; isoler le PATH ne suffit pas.

Le build `desktop:build` nettoie l'analyse PyInstaller puis collecte les notices
depuis les chemins des modules/extensions réellement gelés, dans le **même**
environnement `uv --with pyinstaller==6.16.0`. Les noms de fichiers homonymes sont
conservés. L'inventaire compare les données/DLL de l'archive aux entrées PKG et
les noms PYZ/bootstrap/base_library à Analysis ; une incohérence arrête la commande. Ce contrôle ne
remplace pas l'identification des bibliothèques statiques natives/Rust/npm.

```powershell
# Depuis la racine, après desktop:build, avec le même Python verrouillé :
$env:UV_CACHE_DIR=Join-Path $PWD '.uv-cache'
uv run --locked --with pyinstaller==6.16.0 --project services/pdf-engine python -m scripts.release-inventory

# QA installée isolée sur poste dev ; ne pas appeler ceci une VM clean :
$env:PDF_STUDIO_QA_OUTPUT='data/output/release-gate-006'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows-clean-qa.ps1 -Action Install
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows-clean-qa.ps1 -Action Launch
node scripts/windows-qa-cdp.cjs files
node scripts/windows-qa-cdp.cjs idle-004
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows-clean-qa.ps1 -Action Close
```

L'option `--installed <installation QA sous data/output>` ajoute les fichiers
effectivement installés et leurs SHA-256 à l'inventaire. Inspecter avant
désinstallation. `PDF_STUDIO_QA_OUTPUT` isole aussi les preuves lifecycle et les
cinq répétitions de `windows-qa-performance.ps1` ; son option `-Executable`
doit pointer vers cette même installation. Ne pas réutiliser des rapports
anciens comme résultats de l'artefact final.

`editor-004` utilise maintenant deux mots de passe aléatoires en mémoire,
sans les écrire dans les preuves, et vérifie bon/mauvais mot de passe et AES-256
sur le fichier réellement sauvegardé. Son échantillon n'est pas la scène
éditeur exhaustive du gate. `print` ne produit toujours aucun fichier imprimé :
seul le dialogue Windows suivi de Microsoft Print to PDF et d'une réouverture
du résultat peut fermer ce scénario. DPI/portrait/multi-écran nécessitent des
mesures Windows réelles ; aucun viewport navigateur ne les remplace.

Le gate 006 a reproduit un défaut de compression : après `rewrite_images`,
`garbage>=2` pouvait renuméroter incorrectement une police partagée et altérer
les accents. Le contournement `garbage=1` préservait le texte mais conservait
des variantes d'image réécrites plusieurs fois, jusqu'à 25,3 Mo dans le témoin
natif. Les profils remplacent désormais chaque référence d'image une seule
fois selon le plus grand placement, sans utiliser `rewrite_images`. Les masques,
couleurs complexes et images hors budget sont conservés. Les tests vérifient
déduplication, texte exact, pixels du texte/vecteurs et dictionnaires de police
après réouverture, avec un second lecteur pypdf. Un nouveau sidecar/installateur
et un rejeu natif des trois profils sont obligatoires après cette correction.
Les anomalies upstream correspondantes sont
[polices/xrefs](https://github.com/pymupdf/PyMuPDF/issues/4896) et
[images partagées](https://github.com/pymupdf/PyMuPDF/issues/4918) ; leur existence
ne remplace pas les reproductions synthétiques du dépôt.

La campagne Playwright couvre les parcours navigateur, un OCR réel sur scan et
les conversions locales dans Chromium et Firefox. Elle génère ses propres PDF
non confidentiels et ne lit aucun document personnel. Les observations humaines
historiques restent dans `QA_BROWSER_REPORT.md`.

`QA_AUTOMATION.md` décrit le protocole ; ce n'est pas un résultat de campagne.
Seuls `QA_AUTOMATED_REPORT.md` et les fichiers sous `apps/web/test-results/`
produits par la dernière commande représentent une exécution. Ils sont ignorés
par Git et remplacés au début de chaque campagne afin qu'aucun résultat ancien
ne puisse être mélangé au résultat courant.

La campagne rapide inclut l’OCR réel ainsi que les smoke tests de conversion
DOCX et TXT. Les artefacts sont inspectés côté test. Le résumé Markdown consigne
le texte témoin OCR et, pour les conversions, les durées, tailles, utilisation
de l’OCR, pages, avertissements et validité technique.

## Installation

Depuis un clone neuf :

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

Avant les tests ci-dessous, suivre la [préparation unique des assets](#préparation-unique-des-assets).

```bash
cd services/pdf-engine
uv run pytest
uv run ruff check .
```

```bash
cd apps/web
npm test -- --run --maxWorkers=2
npm run lint
npm run build
npm run typecheck:e2e
npm run qa:e2e:quick
```

Sous WSL, limiter la concurrence Vitest à deux workers évite de concurrencer
inutilement les navigateurs et générateurs volumineux. Exécuter les suites
complètes successivement ; les délais de tests restent inchangés.

## Campagnes navigateur

Sur clone neuf, suivre la préparation ci-dessous. Le runner appelle ensuite le
même préparateur en mode navigateur avant chaque campagne, y compris les tests
d’intégration ; aucune commande séparée de génération n’est nécessaire.

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

## Préparation unique des assets

Depuis `apps/web`, après installation des dépendances ci-dessus :

```bash
npm run qa:prepare -- --download-ocr
npm run qa:prepare                  # même validation, entièrement offline
```

La première commande autorise explicitement le téléchargement des seuls fichiers
OCR manquants. Le mode par défaut `full` prépare toutes les fixtures communes
Web/backend/desktop, dont les images lourdes et le PDF de 250 pages. Modes réduits :
`--mode browser` (sans ressources OCR embarquées), `--mode backend` (petites fixtures
et ressources OCR). `--skip-large` exclut seulement le PDF de 250 pages. Une
ressource OCR absente sans `--download-ocr` produit une erreur explicite.
Aucun téléchargement de navigateur, binaire OCR ou outil système n’est implicite.

Le préparateur `scripts.prepare-qa-assets` réutilise le lecteur strict pypdf de
`validate-qa-pdf` et ouvre les PDF avec PyMuPDF verrouillé ; il
vérifie pages, dimensions, texte témoin/accentué, chiffrement et absence de texte
caché dans les scans. Il décode les images, contrôle tailles et manifestes, et
vérifie les SHA-256 du corpus multi-assets et des ressources OCR. Il conserve les
fichiers existants ; une génération manquante est validée en staging avant
installation. Un fichier invalide arrête la préparation sans être remplacé.
Supprimer uniquement le fichier synthétique signalé pour le régénérer.
Les PDF chiffrés ont des identifiants aléatoires : leur validation est sémantique,
sans exiger un hash identique à chaque génération.

| Assets / consommateurs | Statut et emplacement |
| --- | --- |
| 30 petites fixtures PDF/PNG/JPEG : ouverture, édition, Unicode/accents, conversion, AcroForms, scans français/anglais et orientés, protection | Références versionnées dans `apps/web/e2e/fixtures`, générées si absentes ; les unitaires créent aussi leurs témoins en mémoire |
| PDF 250 pages, >50 Mio | Généré, ignoré : `apps/web/e2e/fixtures/pdf-large.pdf` |
| Six PNG/JPEG lourds, scans de 5 et 50 pages, manifeste | Générés, ignorés : `data/output/windows-qa-004/fixtures` ; utilisés aussi par la QA desktop |
| Scène PDF/JSON, 20 images distinctes et manifeste | Générés, ignorés : `data/output/editor-robustness-008` |
| OCR eng/fra/osd et licence | Cache ignoré `services/pdf-engine/build/ocr` ; source officielle `tesseract-ocr/tessdata_fast`, révision `87416418657359cb625c412a48b6e1d6d41c29bd`, SHA-256 épinglés dans `prepare-ocr-resources.py`, timeout 60 s par fichier |
| Polices, licences, SVG applicatif, icônes Tauri et référence DOCX backend `tests/fixtures/docx_regression` | Versionnés ; livrés par le clone, aucune préparation manuelle |
| Corpus compression et mesures OCR/mémoire/DOCX | Produits par les scripts de mesure à partir de témoins synthétiques ; sorties ignorées, pas des préconditions de tests |
| Navigateurs Playwright, OCRmyPDF/Tesseract/Ghostscript, QPDF, LibreOffice | Dépendances externes à installer explicitement ; aucune saturation disque ni téléchargement caché |
| PDF privés facultatifs des tests DOCX | Fournis volontairement hors Git ; absence = skip explicite, jamais générés ni lus par le préparateur |
| Installateur/sidecar et outils natifs Windows | Construction et qualification spécifiques à Windows ; hors préparation commune |

Nettoyage borné, depuis `apps/web` :

```bash
npm run qa:prepare -- --clean
npm run qa:prepare
```

`--clean` retire seulement les 33 fichiers ignorés régénérables de cette table
(gros PDF et deux corpus). Les références versionnées, ressources OCR en cache,
mesures, résultats de tests et documents utilisateur restent conservés. Le staging
est temporaire sous `data/output/qa-assets`. La simulation de clone vide et
l’idempotence (contenu et dates inchangés au second passage), la réparation
partielle, la corruption, les téléchargements explicites et ce nettoyage sont
couverts par `services/pdf-engine/tests/test_qa_assets.py`.

## Fixtures et sentinelles

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

Après la préparation unique ci-dessus, mesurer le corpus versionné sans document
personnel :

```bash
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

Les helpers de robustesse réutilisent le préparateur commun en mode navigateur
sans gros PDF ; les scénarios 250 pages demandent la préparation complète.
Un lancement direct de Playwright doit être précédé de `npm run qa:prepare`.
Les sous-générateurs restent des outils de maintenance ; ils ne constituent pas
une autre procédure de campagne.
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

## Réserves des sentinelles transverses

Les sentinelles OCR/conversion et intégration sont distinctes du statut global
de la campagne rapide. Ne pas annoncer une campagne entièrement verte quand
les assertions suivantes échouent ; elles restent actives, sans retry ajouté :

- `EDIT-TEXT-NATIVE-003` : Chromium peut émettre trois requêtes après navigation
  au lieu des deux attendues. Reproduit avec le frontend du commit initial,
  sans l’extraction OCR/conversion.
- `EDIT-TEXT-FIDELITY-001` : décalage vertical de 0,75 px Chromium / environ
  0,8 px Firefox pour une tolérance de 0,5 px, également reproduit sans refactor.
- `QA-E2E-010` (restauration après réorganisation) et `QA-E2E-006` (scroll End) :
  échecs observés en campagne, runs isolés verts ; isoler les transitions et
  l’écriture durable avant de conclure à une régression produit.

Les tests de création texte utilisent le glisser actuel ; les sondes overflow
fixent explicitement leur police à 18 pt au lieu de dépendre de la taille dérivée
par l’UI depuis la hauteur du cadre. Les comptages documentaires et diagnostics
utilisent les onglets actuels. Ces adaptations ne modifient pas l’application.

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

Après la préparation commune ci-dessus, depuis la racine dans PowerShell
(Node 22 disponible) :

```powershell
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
