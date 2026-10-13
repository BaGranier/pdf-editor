# Shell desktop et packaging

## Architecture et support

`apps/desktop` est le shell Tauri v2/Rust du frontend `apps/web`. Il supervise
FastAPI : backend source en debug, sidecar PyInstaller en release. Le nom
PDF Studio Local et l'identifiant `com.local.pdfstudio` déterminent les chemins
applicatifs ; changer l'identifiant nécessite une décision de migration.

| Plateforme | État de qualification |
| --- | --- |
| Windows x64 | Build MSVC et bundles NSIS/MSI produits ; NSIS installé, exécuté et désinstallé sur poste dev. Sauvegarde native, OCR eng/fra avec PATH isolé et crash/retry exercés. VM sans outils dev, MSI installé et matrice native complète restent à qualifier. |
| Linux | Bootstrap dev et lancement d'un `.deb` extrait exercés ; dialogues interactifs, installation réelle et parcours fonctionnels restent à qualifier. |
| macOS | Configuration prévue ; build, installation et runtime natifs non qualifiés. |

Aucune plateforme n'a une qualification complète de release grand public.
Les travaux restants sont priorisés dans [NEXT_STEPS.md](NEXT_STEPS.md).

## Prérequis de build

- Node 22, npm, Python >= 3.11 et uv.
- Rust >= **1.88**, MSRV déclaré dans `src-tauri/Cargo.toml` et vérifié par la CI
  desktop Linux ; les dépendances indirectes verrouillées imposent ce minimum.
- Windows : Rust MSVC, Visual Studio Build Tools avec Desktop development with
  C++, Windows SDK et WebView2. Utiliser le Developer PowerShell pour diagnostiquer
  `link.exe` hors PATH ; `npm.cmd` évite le blocage éventuel de `npm.ps1`.
- Linux : WebKitGTK 4.1, GTK et bibliothèques Tauri ; macOS : outils Xcode.

Exemple Debian/Ubuntu :

```bash
sudo apt-get install build-essential curl wget file libssl-dev \
  libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev \
  libwebkit2gtk-4.1-dev patchelf
```

Depuis la racine :

```bash
npm ci --prefix apps/web
npm ci --prefix apps/desktop
uv sync --directory services/pdf-engine --locked
cd apps/desktop
npm run desktop:dev
```

Vite écoute strictement sur `127.0.0.1:5173`. Le debug lance
`uv run python -m app.desktop_server` dans les sources backend ; le placeholder
`externalBin` n'est pas exécuté. Le devcontainer général ne fournit pas Rust
ni WebKitGTK : voir [DEVELOPMENT.md](DEVELOPMENT.md).

## Runtime et diagnostics

Rust choisit un port dynamique sur `127.0.0.1`, transmet les chemins au moteur et
attend une réponse valide de `/health` (timeout de démarrage : 20 secondes).
React reçoit l'URL par `get_backend_status`. Une erreur affiche le diagnostic
et le journal ; `restart_backend` relance le moteur en conservant la session
éditeur en mémoire. La surveillance continue après Réessayer.

Stdout/stderr alimentent `appLogDir/pdf-engine.log` ; les erreurs de lancement
portent le marqueur `BACKEND_START_ERROR`. Les journaux restent locaux et doivent
être examinés/anonymisés avant partage, notamment les messages de bibliothèques.

| Usage | Chemin résolu par Tauri |
| --- | --- |
| Données et sorties | `appLocalDataDir` |
| Cache | `appCacheDir` |
| Journal | `appLogDir/pdf-engine.log` |
| Temporaires | `tempDir/com.local.pdfstudio/backend-<pid>` |

Le package écrit ses sorties dans les données applicatives, sans dépendre du
`data/output` du dépôt. À la fermeture normale, moteur et temporaires sont
nettoyés. Sous Windows, un Job Object `KILL_ON_JOB_CLOSE` termine aussi les
descendants lorsque le shell disparaît brutalement. Shell release GUI et création
des workers sans console évitent une fenêtre terminal parasite.

Après crash, le démarrage Windows nettoie les dossiers `backend-<pid>` âgés de
plus de 24 h uniquement si le PID est absent, la lease accessible exclusivement
et le périmètre canonique sûr. Dossiers récents, actifs, sans lease ou reparse
points sont conservés : le nettoyage ne garantit pas zéro temporaire après crash.

La fenêtre est ajustée avant affichage à la work area physique, aux décorations
et au facteur DPI. Changement de moniteur/DPI déclenche un clamp tout en gardant
le resize manuel ; aucune géométrie n'est persistée. Présentation utilise la
Fullscreen API Web avec repli sur la surface applicative ; Échap revient à
Page unique. Un viewport/DPR Playwright simulé ne qualifie pas le comportement natif.

Debug : `PDF_STUDIO_OPEN_DEVTOOLS=1 npm run desktop:dev` ouvre les DevTools.
Sous WSLg, une WebView blanche liée au rendu peut être diagnostiquée avec
`WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run desktop:dev`, puis, si nécessaire,
`WEBKIT_DISABLE_COMPOSITING_MODE=1` et `LIBGL_ALWAYS_SOFTWARE=1`.

## Fichiers et frontière IPC

Les commandes Rust `open_pdf`, `save_pdf` et `save_pdf_as` possèdent les dialogues
système et les chemins. React reçoit les octets, un nom et un identifiant opaque,
sans accès arbitraire au filesystem. La capability n'expose que `core:default` ;
le plugin shell n'est utilisé que par Rust pour le sidecar déclaré.

Le premier Ctrl+S ouvre **Enregistrer sous** et préserve la source. Seule une
réussite établit la destination de copie pour les Ctrl+S suivants de la session.
Ctrl+Shift+S choisit une autre destination même sans modification. Écriture via
temporaire voisin, synchronisation puis remplacement ; erreur/annulation
conservent l'état modifié. Des edits effectués pendant la sauvegarde restent dirty.
Les chemins/identifiants natifs ne sont pas restaurés par IndexedDB ; les documents
ouverts nativement restent limités à la session.

Le manifeste déclare l'association `.pdf` et les arguments PDF sont consommés
après disponibilité du backend. Le double-clic/« Ouvrir avec » installé reste à
qualifier. Aucun routage single-instance : un second lancement crée une autre
instance. Dans le navigateur, sauvegarde et conversion restent des téléchargements.

## Build et OCR embarqué

```bash
cd apps/desktop
npm run desktop:check
npm run desktop:build
```

`desktop:check` valide configuration/capabilities, construit le web, exécute les
tests du serveur desktop et `cargo check`. `desktop:check:static` omet Cargo ;
il ne valide pas Rust ni une WebView native. Tests complémentaires depuis la racine :

```bash
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --lib
```

`desktop:build` prépare ressources OCR/notices, construit le moteur onefile avec
PyInstaller **6.16.0**, vérifie `/health`, copie le sidecar
`src-tauri/binaries/pdf-engine-<target-triple>[.exe]`, puis lance Tauri et le
build frontend. Construire nativement sur chaque OS ; le backend Python n'est
pas cross-compilé. Sous Windows : `target/release/bundle/nsis` et `msi`.
Les artefacts `target`, `build`, `gen` et sidecars sont ignorés.

Le premier build télécharge les ressources/notices verrouillées. Les scripts
[prepare-ocr-resources.py](scripts/prepare-ocr-resources.py) et
[audit-ocr-licenses.py](scripts/audit-ocr-licenses.py) contrôlent les SHA-256.
Les données eng/fra/osd et le manifest sont embarqués sous `sys._MEIPASS/ocr` ;
les notices sont installées sous `licenses/ocr`. Sources, révisions et empreintes
exactes restent dans ces scripts et les manifests générés.

Le sidecar gelé utilise MuPDF/Tesseract du wheel PyMuPDF **1.26.3** dans un worker
isolé `--ocr-worker`, sans Python utilisateur, OCRmyPDF, Ghostscript, QPDF CLI ou
Tesseract système. Il ne consulte ni PATH ni `TESSDATA_PREFIX` pour l'OCR.
Langue/runtime absent ou corrompu : erreur contrôlée, sans fallback système.
Le worker est supervisé avec timeout/annulation ; OCR à 200 DPI, maximum
40 millions de pixels par page avant allocation. Les rotations PDF orthogonales
sont conservées ; ni deskew ni orientation automatique des pixels ne sont livrés.
`osd` inclus ne constitue pas une fonctionnalité d'orientation automatique.

En développement non gelé, OCRmyPDF/Tesseract/Ghostscript système restent utilisés,
ou `PDF_ENGINE_OCR_RUNTIME` pointe explicitement vers les ressources préparées.
LibreOffice et QPDF CLI sont des outils QA, pas des dépendances runtime du package.

## Redistribution et WebView2

PyMuPDF/MuPDF sont proposés sous AGPL ou licence commerciale ; aucune politique
de distribution ni licence commerciale n'est établie dans le dépôt.
La décision est un P0 de [NEXT_STEPS.md](NEXT_STEPS.md).
[Source officielle PyMuPDF](https://pymupdf.readthedocs.io/en/latest/about.html#license-and-copyright).

Les notices couvrent aussi Python, PyInstaller (exception bootloader),
Tesseract/Leptonica et tessdata_fast. Les langues proviennent de la révision
verrouillée Apache-2.0 de
[tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast/blob/87416418657359cb625c412a48b6e1d6d41c29bd/LICENSE).
`python-environment.json` inventorie l'environnement de build, pas le contenu
exact du binaire distribué. La revue transitive du package entier reste requise.

WebView2 suit la politique Tauri par défaut `downloadBootstrapper` : runtime
absent implique un téléchargement. Aucun runtime offline fixe n'est embarqué.
Node, Rust, MSVC/SDK et Python de développement sont des outils de build, sans
installation attendue chez l'utilisateur final. Signature Windows, notarisation
macOS et mise à jour automatique ne sont pas configurées.
La procédure native et les preuves requises figurent dans
[QA_AUTOMATION.md](QA_AUTOMATION.md).
