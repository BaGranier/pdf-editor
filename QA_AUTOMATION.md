# Campagne QA navigateur automatisée

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
cd services/pdf-engine
uv sync
cd ../../apps/web
npm install
PLAYWRIGHT_BROWSERS_PATH=../../.playwright-browsers \
  npx playwright install chromium firefox
```

`PLAYWRIGHT_BROWSERS_PATH` est facultatif. Il permet de garder les navigateurs
Playwright dans le dépôt de travail (le dossier est ignoré par Git).

Si les binaires ne sont pas installés et qu'aucune installation n'est autorisée,
ne pas lancer de téléchargement implicite : consigner les E2E comme **non
exécutés**. Un scénario écrit ne vaut pas une validation navigateur.

## Exécution

Depuis `apps/web` :

```bash
# Campagne complète Chromium + Firefox, tests lents et visuels inclus
npm run qa:e2e

# Campagne rapide utilisée sur les pull requests
npm run qa:e2e:quick

# Équivalent avec un filtre explicite
npm run qa:e2e -- --grep-invert @slow

# Un seul moteur
npm run qa:e2e:chromium
npm run qa:e2e:firefox

# Diagnostic interactif
npm run qa:e2e:headed
npm run qa:e2e:debug
```

Le scénario `viewer-modes.spec.ts` couvre Continu, Page unique et Présentation :
navigation clavier, sortie `Escape`, absence totale de chrome en Présentation et
rapport entre la résolution du canvas et sa taille CSS. Le rejouer dans Chromium
et Firefox après toute modification du viewer :

```bash
npm run qa:e2e:chromium -- --grep VIEWER-MODES
npm run qa:e2e:firefox -- --grep VIEWER-MODES
```

`viewer-page-transition.spec.ts` couvre le front/back buffer Page unique et
Présentation : maximum deux pages montées pendant un swap, libération de
l’ancienne page après rendu et scène Présentation noire. Le rejouer après une
modification du lifecycle PDF.js :

```bash
npm run qa:e2e:chromium -- --grep VIEWER-PAGE-TRANSITION-001
npm run qa:e2e:firefox -- --grep VIEWER-PAGE-TRANSITION-001
```

`ui-workspace-responsive.spec.ts` vérifie à 1920×1080, 1440×900, 1280×720 et
1024×768 que le footer reste dans la fenêtre sans scroll global et que les
overlays texte/forme restent visibles après resize et navigation :

```bash
npm run qa:e2e:chromium -- --grep UI-WORKSPACE-RESPONSIVE-001
npm run qa:e2e:firefox -- --grep UI-WORKSPACE-RESPONSIVE-001
```

La commande vérifie d'abord les ports `5173` et `8000`. Si un service attendu y
est déjà disponible, Playwright le réutilise en local. Sinon, Playwright démarre
Vite et FastAPI, attend leur disponibilité, puis les arrête en fin de campagne.
Un service inattendu sur l'un de ces ports arrête immédiatement la campagne.

Les URL sont configurables avec `QA_BASE_URL` et `QA_BACKEND_URL`. Pour tester des
services déjà démarrés, définir aussi `QA_SKIP_WEBSERVERS=1`.

La campagne utilise un seul worker par défaut afin que les conversions et les
rendus PDF concurrents ne faussent pas les restaurations ni les mesures mémoire.
`QA_WORKERS=2` permet un diagnostic parallèle volontaire, avec une stabilité
potentiellement moindre sur les machines contraintes.

Les fixtures petites sont recréées avant chaque campagne. La campagne complète
génère en plus `pdf-large.pdf`, un fichier reproductible de plus de 50 Mo et
250 pages. `QA_SKIP_LARGE=1` permet d'éviter cette génération lors d'un diagnostic
local ciblé.

### Qualification gros PDF multi-moteurs

Les scénarios `QA-E2E-015` et `PERF-MEMORY-002` sont marqués `@slow @performance`.
Ils réutilisent `pdf-large.pdf` pour vérifier le premier rendu, la navigation et
le zoom, trois cycles ouverture/fermeture, deux documents lourds simultanés et
l'export d'une modification légère. Les artefacts Playwright contiennent les
durées d'opération et les compteurs structurels (canvases, text/form layers
actifs, iframes d'impression et contenu IndexedDB).

`performance.memory` est une mesure du heap JavaScript utile sous Chromium,
mais ne représente ni la mémoire totale du navigateur ni le GPU. Firefox est
donc qualifié par les mêmes invariants structurels et les durées attachées, sans
seuil absolu de RAM. La WebView Tauri doit être mesurée séparément dans une
campagne native ; elle n'est pas couverte par Playwright Web.

#### Dernière campagne locale — 20 septembre 2026

Exécutée avec Playwright 1.62.0 sur la fixture synthétique `pdf-large.pdf`
(250 pages, 53 508 898 octets). Ces chiffres sont des observations du runner
local, pas des seuils de CI ni une mesure de la RAM totale du navigateur.

| Scénario | Chromium | Firefox | Tauri/WebView |
| --- | --- | --- | --- |
| 250 pages, navigation et zoom | OK — ouverture 1,30 s, fermeture 0,08 s | OK — ouverture 1,36 s, fermeture 0,19 s | Non testé : Rust/Cargo indisponible |
| Trois cycles ouverture/fermeture | OK — ouverture 0,98–1,31 s ; fermeture 0,08–0,09 s | OK — ouverture 1,93–2,03 s ; fermeture 0,17–0,41 s | Non testé : Rust/Cargo indisponible |
| Deux documents lourds | OK — deux entrées IndexedDB, puis 1 et 0 après fermeture | OK — deux entrées IndexedDB, puis 1 et 0 après fermeture | Non testé : Rust/Cargo indisponible |
| Export modifié puis fermeture | OK — scénario complet 6,39 s | OK — scénario complet 6,94 s | Non testé : Rust/Cargo indisponible |

Depuis `VIEWER-CONTINUOUS-VIRTUALIZATION-001`, le mode Continu conserve les 250
shells de page et leurs dimensions PDF, mais ne matérialise canvas, text layer
et overlays que dans une fenêtre centrale : pages visibles plus deux pages de
marge avant/après. Un saut transitoire conserve deux petites fenêtres plutôt
que l'intervalle complet entre les pages. La campagne ciblée du 20 septembre a
observé trois canvases/text layers au premier rendu sous Chromium et Firefox,
et au plus douze pendant les sauts vers les pages 125 et 250. Les assertions
E2E vérifient cette borne structurelle et le démontage de la page 1 après le
saut ; elles ne constituent pas un seuil de RAM/GPU.

Le passage en Page unique reste borné à un ou deux canvases, et les scénarios
vérifient zéro canvas, text/form layer, iframe d'impression ou entrée IndexedDB
après fermeture. Cette campagne ne détecte aucune rétention structurelle après
fermeture, mais ne remplace pas un profilage RAM/GPU ou WebView sur les machines
de release.

La régression DOCX critique est couverte dans
`conversion-docx-regression.spec.ts` sur Chromium et Firefox. Le scénario
convertit une fixture synthétique immédiatement après ouverture, puis après
rechargement et restauration IndexedDB, dans les modes éditable et visuel. Il
contrôle le multipart envoyé, l'absence de HTTP 502, les tailles d'entrée et de
sortie, les pixels non blancs des images et l'absence de clipping Word
`lineRule="exact"`.

## Résultats

Après l'exécution :

- `apps/web/test-results/playwright-report/` : rapport HTML ;
- `apps/web/test-results/results.json` : rapport machine ;
- `apps/web/test-results/screenshots/` : captures d'échecs ;
- `apps/web/test-results/traces/` : traces du premier retry ;
- `apps/web/test-results/videos/` : vidéos des échecs ;
- `QA_AUTOMATED_REPORT.md` : résumé de campagne.
- `apps/web/test-results/docx-visual-quality/` : mesures structurelles DOCX,
  rendu LibreOffice et comparaisons côte à côte lorsque disponibles.
- `apps/web/test-results/docx-editable-real-document/results.json` : mesures
  agrégées du test DOCX éditable sur document local, sans contenu PDF ou DOCX.

Le rapport indique le hash Git complet, l'état propre ou modifié du worktree et
une empreinte SHA-256 de tous les fichiers suivis ou non ignorés. Cette empreinte
identifie exactement l'état testé avant commit ; après création du commit, une
nouvelle campagne doit être exécutée pour publier un rapport rattaché à ce hash.

Les PDF de `apps/web/e2e/fixtures` sont des entrées synthétiques versionnées.
Les téléchargements, traces, captures, résultats JSON et rapports HTML sont des
artefacts générés sous `test-results` et ne doivent jamais être ajoutés comme
fixtures.

Le code de sortie reste celui de Playwright si un scénario bloquant échoue, même
si le résumé Markdown a pu être généré. Pour régénérer seulement le résumé :

```bash
npm run qa:report
```

Le rapport HTML s'ouvre avec `npm run qa:e2e:report`.

### Régression DOCX éditable sur document réel

Le PDF privé n'est jamais versionné. Le chemin
`data/input/manual-docx-regression/` est couvert par les règles d'ignorance des
PDF d'entrée. Le test reste ignoré tant que son exécution n'est pas explicitement
autorisée par `QA_REAL_DOCX_PDF`, même si un fichier local existe :

```bash
cd services/pdf-engine
QA_REAL_DOCX_PDF=data/input/manual-docx-regression/2-ENGAGEMENT_INDIVIDUEL_ETUDIANT_2026-2027.pdf \
  UV_CACHE_DIR=/tmp/pdf-engine-uv-cache \
  uv run pytest -m docx_real_document
```

La validation rouvre obligatoirement la sortie avec `python-docx`, contrôle
qu'elle contient des paragraphes modifiables et au moins 95 % des mots source,
et refuse qu'une sortie image-only valide le mode `editable`. Elle mesure aussi
les paragraphes centrés, le gras intégral ou mixte, les listes et puces vides,
les sections Word, les sauts explicites et les pages quasi vides. LibreOffice
fournit le nombre de pages rendu lorsqu'il est utilisable ; sinon le rapport
indique explicitement la mesure structurelle et la réserve. Le rapport
Markdown indique « non exécuté » lorsque la donnée privée locale est absente.
La section « DOCX editable spacing quality » publie également les valeurs
d'interlignage, les espacements avant/après, la marge interne de l'encadré et
une estimation de densité par section, la moyenne de mots et de lignes estimées
par paragraphe, sans reprendre le texte privé. Le statut de lisibilité devient
un échec si les paragraphes longs sont compactés sous 1,12, même lorsque le
document tient dans ses trois sections structurelles.

La section « DOCX cover page fidelity » utilise une couverture synthétique sans
donnée privée. Elle relève le nombre de blocs, l'espace blanc approximatif, les
positions relatives du titre, de la date et des auteurs, la hiérarchie de taille
et la rétention textuelle. Le test local `docx_cover_page` peut remplacer cette
fixture par `data/input/manual-docx-regression/cort_test.pdf` lorsqu'il existe.
Le rendu LibreOffice reste obligatoire dans la CI complète et apparaît comme
une réserve lorsqu'il est indisponible localement.

## Isolation et diagnostics

Playwright crée un contexte neuf pour chaque test. Les scénarios de persistance
inspectent explicitement IndexedDB (`pdf-editor-mvp-db`) et les clés
`localStorage`. Une fixture automatique collecte pour chaque test :

- `console.error` et erreurs non gérées de page ;
- requêtes réseau échouées ;
- réponses HTTP 500 et plus ;
- durées instrumentées ;
- nombre de documents/pages présents ;
- heap JavaScript de la page sous Chromium, lorsque disponible.

Le heap JavaScript n'est pas présenté comme la mémoire totale du navigateur.
Firefox indique explicitement cette mesure comme non disponible. Seules les
annulations réseau propres au cycle de navigation sont autorisées par défaut ;
une erreur connue propre à un scénario doit être ajoutée localement et justifiée.
Lors de cette première intégration, les constats de contraste sont non bloquants
mais figurent séparément dans le rapport Markdown ; les contrôles sans nom
accessible et la navigation clavier restent bloquants.

## Captures visuelles

Les références sont séparées automatiquement par projet Chromium/Firefox. La
tolérance est `maxDiffPixelRatio: 0.02`, avec animations désactivées et curseur
masqué. Elle absorbe de faibles différences d'anticrénelage sans accepter un
changement structurel important.

Mettre à jour volontairement les références après revue :

```bash
npm run qa:e2e:update-snapshots -- --grep @visual
```

## Qualification native Windows 002

Résultats et limites :
[WINDOWS_NATIVE_QUALIFICATION_002.md](WINDOWS_NATIVE_QUALIFICATION_002.md).
Les scripts suivants utilisent l'application installée et la WebView2 réelle,
sans émuler un DPR navigateur. Exécuter depuis la racine du dépôt sous Windows.
WMI peut nécessiter une exécution hors bac à sable ; installer le MSI par machine
nécessite des privilèges administrateur. Ne pas confondre ces deux conditions.

```powershell
# Sélectionner le Node 22 QA existant, puis vérifier les exécutables résolus.
$env:PATH = (Join-Path $PWD 'data/output/windows-toolchain/node_modules/node-win-x64/bin') + ';' + $env:PATH
node --version
npm.cmd --version
where.exe node
where.exe npm
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows-qa-environment.ps1

# Nouvelle fixture raster française seulement, sans régénérer les autres PDF.
uv run --locked --project services/pdf-engine python -m scripts.generate-qa-pdfs --french-only
```

Installer le NSIS généré dans `data/output/windows-qa-002/installers/NSIS`,
avec `/S` et `/D=<chemin absolu>` en dernier argument. Ne pas remplacer une
installation utilisateur pour la QA. Le helper de processus refuse une application
hors dépôt et exige exactement une instance. Il ne cible aucun processus par
nom seul pour les actions destructives.

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222'
$env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $PWD 'data/output/windows-qa-002/manual-profile'
$fixture = Join-Path $PWD 'data/output/windows-qa-002/contrat été.PDF'
Copy-Item -LiteralPath apps/web/e2e/fixtures/conversion-simple-text.pdf -Destination $fixture
Start-Process -FilePath data/output/windows-qa-002/installers/NSIS/pdf-studio-local.exe -ArgumentList ('"' + $fixture + '"') -WindowStyle Hidden
node scripts/windows-qa-cdp.cjs metrics
node scripts/windows-qa-cdp.cjs files
node scripts/windows-qa-cdp.cjs smoke
node scripts/windows-qa-cdp.cjs conversion
node scripts/windows-qa-cdp.cjs stress
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows-native-qa.ps1 -Action Close
```

`files` crée du texte et ouvre les vrais dialogues Windows : annulation Save As,
destination Unicode, Save suivant, overwrite Oui. Utiliser une session fraîche
pour `retry` (ajout d'un autre témoin texte), qui tue deux workers puis vérifie
session/dirty/ports. Une session interrompue peut conserver des objets : la fermer
avant de relancer le même scénario. Les libellés du helper natif sont ceux de
Windows français. `print` valide seulement aperçu et demande d'impression ;
il ne produit pas un PDF imprimé et ne qualifie pas le dialogue OS.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows-qa-processes.ps1 -Action Snapshot
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows-qa-processes.ps1 -Action KillWorker
# KillSidecar est disponible, mais son scénario complet reste NT dans le rapport.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows-qa-processes.ps1 -Action CrashShell

# Fermer toutes les instances avant ces cinq répétitions.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows-qa-performance.ps1
```

`Snapshot` conserve RAM, private bytes, CPU cumulé, handles et arbre de processus.
`CrashShell` conserve aussi les ports avant/après et l'existence du temporaire
applicatif. Le collecteur filtre les dates de création pour éviter les faux liens
dus aux PID recyclés. La performance utilise un profil WebView2 QA isolé :
HWND observé, backend ready observé par CDP, canvas du **PDF cible**, et zéro
descendant après fermeture normale. Ces temps incluent l'observateur Node/CDP ;
ils ne sont pas une mesure de pixels peints ou de latence interactive complète.

OCR nominal : lancer une session avec `conversion-scan.pdf` puis `ocr-eng`, ou
`conversion-scan-french.pdf` puis `ocr-fra`. Pour fra, utiliser un dossier QA
tessdata complet avec eng/fra/osd, configs et tessconfigs. Ce ticket réutilise le
dossier ignoré de la campagne 001, sans le redistribuer.

```powershell
node scripts/windows-qa-cdp.cjs ocr-eng
node scripts/windows-qa-cdp.cjs ocr-fra
qpdf --check data/output/windows-qa-002/ocr/fra.pdf
gswin64c -q -dNOPAUSE -dBATCH -sDEVICE=nullpage data/output/windows-qa-002/ocr/fra.pdf
uv run --locked --project services/pdf-engine python -m scripts.windows-qa-validate
```

Pour les absences, isoler **l'environnement du nouveau processus QA** et fermer
l'instance précédente. Ne pas supprimer ni renommer les outils système.

| Environnement au lancement | Scénario CDP | Code attendu |
| --- | --- | --- |
| PATH Windows/System32 uniquement, Node invoqué par chemin absolu | `ocr-missing-tesseract eng OCR_TOOL_UNAVAILABLE` | 503 |
| PATH Windows + Tesseract + Ghostscript, sans OCRmyPDF | `ocr-missing-ocrmypdf eng OCR_TOOL_UNAVAILABLE` | 503 |
| tessdata système eng/osd | `ocr-missing-fra fra OCR_LANGUAGE_UNAVAILABLE` | 422 |
| dossier QA contenant seulement fra.traineddata | `ocr-missing-eng eng OCR_LANGUAGE_UNAVAILABLE` | 422 |
| TESSDATA_PREFIX vers un dossier inexistant | `ocr-invalid-prefix` | OCR eng réussi par fallback Tesseract constaté |

La découverte Windows d'OCRmyPDF peut trouver Ghostscript hors PATH : cela
n'est pas une preuve de dépendance absente. QPDF CLI est un validateur QA.
La décision de distribution et les sources de licence sont dans le rapport.

Upgrade local : conserver les installateurs baseline dans le dossier ignoré,
créer un JSON QA `{"version":"0.1.1"}`, puis exécuter `tauri build --bundles nsis
--config <chemin QA>` depuis `apps/desktop`. Installer 0.1.0 puis 0.1.1, relever
ProductVersion, lancement et persistance avant désinstallation. Cette configuration
ne modifie pas les versions du dépôt. Le build QA 0.1.1 peut rester dans les
artefacts ignorés ; il n'est pas une release publiée.

Artefacts : `data/output/windows-qa-002/{environment,window-metrics,screenshots,
ocr,installers,performance,reports}`. Les JSON contiennent des résultats par
scénario ; le rapport versionné qualifie leur portée. Ne jamais convertir le
succès API de conversion, l'aide d'un compilateur ou la présence d'un iframe
en validation native exhaustive. LibreOffice absent : le validateur `--required`
doit échouer, même si le mode optionnel retournerait 0 avec `unavailable`.

## Contrôles manuels restants

Ces contrôles sont documentés dans le résumé, mais ne bloquent pas la campagne :

- fluidité ressentie ;
- qualité visuelle globale du rendu PDF ;
- acceptabilité du décalage Firefox ;
- consommation mémoire totale réelle du navigateur et du système ;
- raccourcis dépendant du clavier physique ;
- modes Page unique et Présentation sur PDF portrait et paysage, avec entrée et
  sortie fullscreen ;
- netteté HiDPI du texte fin et des lignes après un changement de fit ;
- comportement avec des PDF confidentiels ou non reproductibles ;
- validation finale du niveau de gravité des anomalies.


## Régression EDITOR-FEATURES-EXPORT-PRESENTATION-003

Les fixtures PNG/JPEG, JPEG EXIF et vingt slides sont synthétiques, générées par
`scripts/generate-qa-pdfs.py`. Aucun document personnel n'est utilisé.

```bash
cd apps/web
PLAYWRIGHT_BROWSERS_PATH=/workspace/.playwright-browsers npx playwright test \
  e2e/specs/editor-export-presentation.spec.ts e2e/specs/storage-upgrade.spec.ts \
  e2e/specs/save-editing.spec.ts e2e/specs/shape-editing.spec.ts \
  e2e/specs/signature-editing.spec.ts e2e/specs/pdf-forms.spec.ts \
  e2e/specs/text-markup.spec.ts --project=chromium --project=firefox
```

Les sept nouveaux scénarios couvrent sauvegarde web/source intacte, images/plans/
persistance, carré/cercle/flèche, vingt slides et navigation rapide, dix images
partageant un asset et exports successifs, DPR 2/zooms 50–200 %/thèmes/modes et upgrade IndexedDB v1 non destructif.
La logique Save As native est testée par IPC simulé dans Vitest ; elle ne
constitue aucune preuve d'un dialogue Windows réel.

```bash
# Depuis la racine, mesure de quatre fixtures sans versionner les sorties :
services/pdf-engine/.venv/bin/python scripts/measure-editor-export.py
```

Ce script consigne tailles, durées, dimensions d'images et pic RSS sous
`data/output/editor-export-003`. Le sampling RAF des slides contrôle le canvas
visible, la géométrie et les swaps ; le compteur de canvases et le heap JS donnent
une indication de mémoire, sans prouver l'absence de fuite de mémoire GPU.
Le résultat daté est conservé dans
[QA_EDITOR_EXPORT_PRESENTATION_003.md](QA_EDITOR_EXPORT_PRESENTATION_003.md).
Les artefacts Playwright et les PDF de mesure restent ignorés.

Validation Windows native : **NON RÉALISÉE / À REQUALIFIER** ; utiliser le plan
de requalification du rapport, sans remplacer les rapports Windows historiques.
