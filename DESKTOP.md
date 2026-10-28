# DESKTOP-RELEASE-001 — shell Tauri et préparation de release

État Preview Windows et limitations assumées : [MVP_STATUS.md](MVP_STATUS.md).
`desktop:check` / `desktop:check-source` utilisent uniquement la configuration
source, sans sidecar ni notices générées. `desktop:build` prépare les vrais
artefacts puis applique `src-tauri/tauri.package.conf.json` ;
`desktop:check-package` refuse les ressources ou le sidecar manquants.
Save/Export natifs : transport binaire Tauri et plafond Preview de **25 Mio**
par PDF généré (27 011 971 octets qualifiés avant application de cette borne).
L'impression intégrée est expérimentale ; Save/Export puis lecteur externe est
le parcours supporté. La VM clean reste une qualification ultérieure distincte.

Gate Windows 006 : **NOT READY**. La VM clean est indisponible (confirmation
utilisateur) ; les résultats du poste de développement ne la remplacent pas.
Les blockers actifs sont dans [NEXT_STEPS.md](NEXT_STEPS.md).

Les anciennes campagnes natives 002/004 ne sont pas versionnées dans ce checkout.
La procédure active est dans [QA_AUTOMATION.md](QA_AUTOMATION.md).
Le backend Windows utilise maintenant un Job Object : la disparition forcée
du shell termine aussi ses descendants PyInstaller. Un dossier temporaire peut
subsister après crash brutal. Le MSI est construit, mais son installation sur
le poste QA est empêchée par les privilèges administrateur. DPI/multi-écran,
impression produite et smoke test de VM clean restent à qualifier. Le package
Windows inclut désormais l'OCR ; sa portée est décrite dans le rapport 004.

Les limites historiques de l'audit Windows 11 doivent être distinguées des
preuves courantes de [MVP_STATUS.md](MVP_STATUS.md).
Build MSVC, bundles MSI/NSIS et parcours depuis une installation NSIS ont été
exécutés ; la qualification des autres DPI et du multi-écran reste ouverte.

## Architecture retenue

L’intégration native vit dans `apps/desktop`, tandis que `apps/web` reste le
frontend React/Vite utilisable seul et `services/pdf-engine` reste le backend
FastAPI. Cette séparation garde les cycles de développement, les dépendances et
les responsabilités de packaging indépendants.

Le devcontainer général est décrit dans [DEVELOPMENT.md](DEVELOPMENT.md). Il ne
contient pas actuellement la toolchain Rust/Tauri nécessaire à ce workspace.

```text
apps/web (React/Vite)
        │ commande Tauri get_backend_status
        ▼
apps/desktop (Tauri v2 / fenêtre native)
        │ processus contrôlé, port dynamique 127.0.0.1
        ▼
services/pdf-engine (FastAPI / OCR / conversion locale)
```

Le nom **PDF Studio Local** et l’identifiant `com.local.pdfstudio` sont
provisoires. Un changement d’identifiant changera également les répertoires OS
de l’application.

## Frontières Web / Desktop pour les fichiers

Le frontend reste volontairement utilisable dans un navigateur sans accès au
système de fichiers. Le flux réellement livré est donc actuellement le suivant :

| Action | Web | Desktop |
| --- | --- | --- |
| Ouvrir depuis l'interface | sélecteur de fichiers du navigateur | dialogue système limité aux PDF |
| Exporter | téléchargement navigateur | dialogue système Save As, puis nouvel onglet lié à la destination choisie |
| Enregistrer sous | dialogue applicatif de nom, puis téléchargement | dialogue système avec nom PDF proposé |
| Premier Enregistrer après ouverture | dialogue de nom puis téléchargement | Save As, source préservée |
| Enregistrer après un Save As réussi | téléchargement navigateur | écriture atomique vers la copie choisie pendant la session |

Il n'existe toujours aucune permission filesystem dans la capability de la
WebView. Les commandes Rust `open_pdf`, `save_pdf` et `save_pdf_as` affichent
les dialogues natifs et conservent le chemin réel dans le processus Rust. React
ne reçoit que le contenu PDF, son nom et un identifiant de destination opaque :
il ne peut donc ni lire ni écrire un chemin arbitraire. `save_pdf` écrit dans
un fichier temporaire du même répertoire, synchronise ce fichier, puis le
renomme sur la destination ; sous Linux, cette substitution est atomique.

Le premier `Ctrl+S` ouvre Save As pour tout document ouvert, y compris une
source native. Seul un Save As réussi établit la destination de sauvegarde de
la session. Annulation et erreur laissent le document modifié ; Save As explicite
reste disponible pour une autre copie. L'identifiant de la source et celui de
la copie ont des rôles distincts, et aucun chemin de sauvegarde n'est persisté.
IndexedDB ne réplique pas les documents Desktop : il reste le mécanisme de
restauration des documents Web, sans devenir une seconde source de vérité pour
un fichier natif.

Le manifeste Tauri déclare désormais `.pdf` / `application/pdf` comme type que
l'application peut éditer. Cette déclaration prépare les installateurs et
« Ouvrir avec ». Les arguments PDF de démarrage sont consommés par Rust puis
transmis à React après disponibilité du backend ; ce parcours a été testé sous
Windows depuis l’installation. Le double-clic reste à qualifier et un second
lancement n’est pas routé vers la fenêtre existante.

## Requalification après EDITOR-FEATURES-EXPORT-PRESENTATION-003

Validation WSL : logique frontend/backend et contrôles statiques portables ;
voir [QA_EDITOR_EXPORT_PRESENTATION_003.md](QA_EDITOR_EXPORT_PRESENTATION_003.md).
**Validation Windows native : PARTIAL au gate 006, sur poste dev uniquement.**

Le gate 006 a rejoué les sauvegardes usuelles et erreurs, l'OCR eng/fra/mixte,
une scène d'images avec trois profils, un minimum de formulaires, AES-256,
présentation et lifecycle depuis NSIS. La couverture n'est pas exhaustive :
chemins longs en Save As, Save volumineux, intégration OS, impression produite,
affichage cible/DPI et VM clean restent des gates ouverts. La matrice courante
est ignorée sous `data/output/release-gate-006/`. Les rapports historiques
Windows ne sont pas modifiés. Aucune release Windows qualifiée n'est déclarée.

## Prérequis de développement et de compilation

Les éléments de cette section concernent les personnes qui développent,
contrôlent ou construisent l'application. Ils ne constituent pas une liste de
prérequis destinée à l'utilisateur final : un installateur publié devra prendre
en charge la WebView et le sidecar nécessaires sans demander Node.js, npm,
Rust/Cargo, un compilateur C/C++ ou un Python de développement.

- Node.js 22 et npm ;
- Python 3.11 et [uv](https://docs.astral.sh/uv/) ;
- Rust stable **>= 1.88** (`rustc`, `cargo`). Tauri v2 et le plugin shell
  annoncent un minimum 1.77.2, mais les versions indirectes verrouillées de
  `time` et `serde_with` portent le MSRV effectif à 1.88. Le projet le déclare
  dans `src-tauri/Cargo.toml` et la CI le vérifie avec Rust 1.88.0 ;
- les dépendances système Tauri v2 de la plateforme (WebView2 sous Windows,
  WebKitGTK 4.1 et les bibliothèques de build sous Linux, outils Xcode sous
  macOS) ;
- pour développer et tester les fonctions OCR : OCRmyPDF, Tesseract,
  Ghostscript et QPDF, avec les langues voulues ;
- LibreOffice est nécessaire aux validations visuelles DOCX qui l’utilisent,
  mais pas à la conversion DOCX exécutée par l'application.

Exemple Debian/Ubuntu :

```bash
sudo apt-get install build-essential curl wget file libssl-dev \
  libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev \
  libwebkit2gtk-4.1-dev patchelf
```

Depuis la racine :

```bash
cd apps/web && npm ci
cd ../desktop && npm ci
cd ../../services/pdf-engine && uv sync --locked
```

### Windows 11

Installer Visual Studio Build Tools 2022 avec « Desktop development with C++ »
(MSVC x64/x86 et Windows SDK), Rust stable MSVC >= 1.88, Node 22, Python 3.11 et
uv. `link.exe` peut être hors PATH d’un PowerShell ordinaire : le build Rust de
l’audit l’a trouvé via l’installation Visual Studio. Pour un diagnostic explicite,
utiliser le Developer PowerShell de Visual Studio et `where.exe link`.

```powershell
node --version
npm.cmd --version
py -3.11 --version
uv --version
rustc -vV
cargo -V
rustup show
where.exe link

cd apps/web
npm.cmd ci
cd ../desktop
npm.cmd ci
cd ../../services/pdf-engine
uv sync --locked
uv run python -m pytest
uv run python -m ruff check .
cd ../../apps/desktop
npm.cmd run desktop:check
npm.cmd run desktop:dev
npm.cmd run desktop:build
```

`npm.cmd` évite le script `npm.ps1` lorsque la politique PowerShell le bloque,
sans modifier cette politique. Les scripts Python du projet sont lancés par uv
en mode module ; aucun alias `python3` Windows n’est nécessaire.

Le développement web historique utilise Tesseract, OCRmyPDF et Ghostscript
(`gswin64c`) système. QPDF CLI reste un outil de QA. Le sidecar Windows gelé
utilise son propre moteur MuPDF/Tesseract et ses langues eng/fra/osd, indépendamment
du PATH et de `TESSDATA_PREFIX`. Vérifier les versions et `tesseract --list-langs`
uniquement pour le parcours web historique.
`TESSDATA_PREFIX`, s’il est utilisé, doit désigner un dossier contenant les
langues **et** les configurations Tesseract (`configs`, `tessconfigs`). L’audit
a d’abord reproduit l’erreur explicite de langue `fra` absente, puis exécuté
l’OCR `eng`/`fra` avec un dossier QA complet. LibreOffice reste réservé à la QA.

Les bundles se trouvent dans `src-tauri/target/release/bundle/msi` et `nsis`.
WebView2 installé a été testé ; le bundle conserve le bootstrapper Tauri par
défaut pour le runtime manquant. Ce cas et l’installation hors ligne restent
à qualifier sur VM clean. Les langues OCR et notices sont incluses dans ces
installateurs ; aucun exécutable Ghostscript/QPDF/OCRmyPDF n'y est ajouté.

La configuration déclare explicitement `downloadBootstrapper`, silencieux :
WebView2 est une dépendance utilisateur prise en charge par l'installateur,
téléchargée si absente. **Une première installation sans WebView2 nécessite le
réseau.** Aucun runtime WebView2 fixe n'est embarqué. L'OCR embarqué fonctionne
localement une fois l'installation et le runtime disponibles ; cela ne promet
pas une installation initiale offline. L'absence online/offline et la lisibilité
de l'erreur offline restent `ENV`, sans désinstaller le runtime du poste de QA.

## Développement

Depuis le workspace desktop :

```bash
cd apps/desktop
npm run desktop:dev
```

Vite écoute strictement sur `127.0.0.1:5173`. Le debug lance
`uv run python -m app.desktop_server` dans les sources backend ; le placeholder
`externalBin` n'est pas exécuté. Le devcontainer général ne fournit pas Rust
ni WebKitGTK : voir [DEVELOPMENT.md](DEVELOPMENT.md).

## Build et sidecar

```bash
cd apps/desktop
npm run desktop:build
```

Cette commande :

1. construit un exécutable Python `pdf-engine` avec PyInstaller 6.16.0 via un
   environnement éphémère `uv --with` ;
2. lance ce binaire sur `127.0.0.1` et vérifie `/health` ;
3. détecte le target triple Rust ;
4. le copie sous
   `src-tauri/binaries/pdf-engine-<target-triple>[.exe]`, conformément à
   `bundle.externalBin: ["binaries/pdf-engine"]` ;
5. construit le frontend puis le bundle Tauri de la plateforme courante.

Le sidecar PyInstaller embarque l'interpréteur Python et les modules Python du
moteur. `prepare-ocr-resources.py` télécharge les langues eng/fra/osd d'une
révision tessdata_fast verrouillée, contrôle leurs SHA-256 et produit un manifest.
PyInstaller les embarque sous `ocr/` ; `sys._MEIPASS/ocr` est résolu à chaque
exécution, sans chemin d'installation fixe ni dépendance au dépôt. Les notices
sont également installées sous `licenses/ocr/`. Les bundles multi-plateformes
ne sont pas tous qualifiés : voir le rapport Windows 004.

### Stratégie des dépendances OCR et conversion

Le sidecar gelé lance un worker `--ocr-worker` dans le même exécutable Python
packagé. Il utilise `Pixmap.pdfocr_tobytes` et le moteur OCR intégré au wheel
PyMuPDF 1.26.3 ; aucun nouveau package Python majeur n'est ajouté. Les langues
sont validées avant OCR, y compris par checksum. Une ressource absente/corrompue
produit une erreur contrôlée, sans fallback vers un Tesseract utilisateur.
Le développement non gelé conserve le parcours système historique, ou utilise
explicitement `PDF_ENGINE_OCR_RUNTIME` vers les ressources préparées pour la QA.
Le worker est isolé, borné à 40 millions de pixels par page avant allocation et
supervisé avec timeout/annulation ; les descendants appartiennent au Job Object.
Le mode intégré ne redresse pas les pages inclinées. `osd` est inclus, sans
promesse d'orientation automatique. Force OCR rasterise les pages à 200 DPI et
ajoute une couche texte ; skip-text conserve les pages déjà numériques.

| Outil / donnée | Utilisation réelle | Windows | macOS | Linux | Décision de release actuelle |
| --- | --- | --- | --- | --- | --- |
| MuPDF/Tesseract/Leptonica | OCR du sidecar gelé | intégré au wheel PyMuPDF | non qualifié | non qualifié | Voie AGPL approuvée au ticket 006 ; obligations sources et notices encore à fermer. |
| `tessdata` `eng`, `fra`, `osd` | langues locales | ressources verrouillées embarquées | non qualifié | non qualifié | Apache-2.0, notice incluse ; SHA et versions exactes dans le rapport 004. |
| OCRmyPDF | OCR web historique | développement seulement | parcours historique | parcours historique | Pas de redistribution dans le package 004. |
| Ghostscript | dépendance du parcours OCRmyPDF | développement seulement | parcours historique | parcours historique | Pas de redistribution dans le package 004 ; licence AGPL/commerciale reste pertinente pour d'autres stratégies. |
| QPDF CLI | contrôle PDF de QA ; aucun appel CLI direct dans le moteur applicatif | outil système QA | outil système QA | outil système QA | Pas de bundle ; distinguer ce CLI des bibliothèques PDF utilisées par les dépendances OCR. |
| LibreOffice | validation visuelle DOCX, pas la conversion applicative courante | non requis au runtime | non requis au runtime | non requis au runtime | Réservé à la QA, non distribué avec l'application. |

Ce tableau décrit une stratégie technique, non une autorisation de
redistribution. Toute décision d'empaquetage doit inclure les licences exactes
des versions retenues, les notices, les dépendances transitives et une
validation juridique/distribution par plateforme.

### Distribution Windows et licences

Décision utilisateur au ticket 006 : **A — distribution sous AGPL approuvée,
avec obligations identifiées**. La voie propriétaire avec ce wheel n'est pas
retenue ; une licence commerciale Artifex serait à examiner si cette politique
changeait. Le choix AGPL ferme la décision de politique, pas la conformité du
package. Il ne constitue pas un avis juridique.

- PyMuPDF **1.26.3**, verrouillé dans `pyproject.toml`/`uv.lock` ; MuPDF
  **1.26.3**, mesuré via `pymupdf.version`, DLL `mupdfcpp64.dll` incluse.
  `_mupdf.pyd`, `_extra.pyd` et modules Python sont gelés en PyInstaller
  **6.16.0 onefile**, avec Python **3.11.9**, eng/fra/osd tessdata_fast.
- Le fichier `COPYING` du wheel PyMuPDF indique seulement la double licence.
  Le texte AGPL complet de MuPDF 1.26.3 est inclus sous
  `licenses/application-AGPL-3.0.txt` et `licenses/ocr/MuPDF-COPYING`.
- `licenses/runtime/` conserve les licences des distributions **effectivement
  référencées par Analysis PyInstaller**, avec leur chemin complet (aucun
  écrasement de deux `LICENSE` homonymes). La collecte utilise le même
  environnement éphémère que le gel. Les licences du runtime Python, OpenSSL
  **3.0.13**, zlib **1.3.1**, Expat **2.6.0**, libxml2 **2.11.9** et libxslt
  **1.1.45** sont ajoutées avec sources officielles et SHA-256 contrôlés.
  Un changement de ces versions Windows impose une nouvelle revue des notices.
- Tesseract/Leptonica et tessdata ont leurs textes upstream verrouillés dans
  `licenses/ocr/`. Les licences des fontes web sont dans les ressources web
  `/fonts/`. Ghostscript, OCRmyPDF et QPDF CLI ne sont pas redistribués.

Avant diffusion, préparer les sources correspondant **exactement** aux binaires
(application, dépendances AGPL, changements et scripts de construction), les
conditions de licence et notices d'absence de garantie, ainsi qu'un moyen
conforme d'obtenir ces sources avec la distribution. Déterminer les mentions
accessibles dans l'interface et les informations d'installation applicables
selon les sections 4–6 de l'AGPL. Aucun emplacement public de sources ni offre
de sources n'a été publié par cette campagne (aucun push).

**Notices : PARTIAL.** L'inventaire de fichiers/DLL ne prouve pas la liste des
bibliothèques statiques du wheel MuPDF : codecs JPEG/PNG/OpenJPEG/JBIG2,
FreeType/HarfBuzz, etc. Le rapprochement de leurs versions et notices avec ce
wheel doit être fermé. Les notices des dépendances Rust liées et npm intégrées
dans les bundles web doivent aussi être contrôlées et installées. La collecte
Python seule ne vaut pas validation transitive globale. Les DLL MSVC CRT
effectivement gelées doivent aussi être rapprochées des droits de redistribution
et de la liste REDIST Microsoft ; leur présence n'est pas une approbation de
ces conditions. Ces obligations restent
des blockers de redistribution ; aucune autorisation publique/propriétaire
n'est déduite de la seule présence des textes.

Sources officielles : [PyMuPDF : double licence](https://pymupdf.readthedocs.io/en/latest/about.html#license-and-copyright),
[PyMuPDF 1.26.3 COPYING](https://github.com/pymupdf/PyMuPDF/blob/1.26.3/COPYING),
[MuPDF 1.26.3 COPYING](https://github.com/ArtifexSoftware/mupdf/blob/1.26.3/COPYING),
[MuPDF : bibliothèques tierces](https://github.com/ArtifexSoftware/mupdf/blob/1.26.3/Makethird),
[CPython 3.11.9 : dépendances Windows](https://github.com/python/cpython/blob/v3.11.9/PCbuild/get_externals.bat),
[Microsoft : redistribution Visual C++](https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files),
[Tauri : installation WebView2](https://v2.tauri.app/distribute/windows-installer/#webview2-installation-options).

Les artefacts PyInstaller, `target/`, `src-tauri/gen/` et tous les sidecars
générés sont ignorés par Git. On peut préparer manuellement un binaire déjà
construit :

```bash
uv run --project services/pdf-engine python -m scripts.prepare-tauri-sidecars \
  --source /chemin/vers/pdf-engine \
  --target-triple x86_64-unknown-linux-gnu
```

La convention de suffixe et la résolution par le seul nom `pdf-engine` suivent
la [documentation sidecar Tauri v2](https://v2.tauri.app/develop/sidecar/).

Le cache Rust `apps/desktop/src-tauri/target` peut occuper plusieurs gigaoctets.
Il peut être supprimé sans toucher aux sources ; la compilation suivante le
recréera :

```bash
cd apps/desktop/src-tauri
cargo clean
```

## Cycle de vie et stockage

Le processus Rust possède le handle du backend. Il capture stdout/stderr dans
`pdf-engine.log`, impose un timeout de démarrage de 20 secondes, expose
`get_backend_status` et `restart_backend`, puis tue le processus et nettoie le
répertoire temporaire à la fermeture de l’application.

Sous Windows, l’arrêt normal ou la relance termine l’arbre enfant : uv et
PyInstaller onefile peuvent chacun posséder un second processus Python.
Cet arrêt forcé de l’arbre n’est pas un SIGTERM gracieux. Le crash brutal du
processus Rust termine les descendants via le Windows Job Object ; les
temporaires après crash sont traités au prochain démarrage selon les leases.
L’éditeur conserve sa session en mémoire pendant une panne du backend ; la
surveillance continue après Réessayer. Les erreurs de démarrage sont aussi
écrites dans le journal avec `BACKEND_START_ERROR`.

La géométrie est calculée avant d’afficher la fenêtre, à partir de la work area
physique du moniteur, des décorations et de son facteur DPI. Les tailles cible
et minimale logiques sont limitées à l’espace disponible. Le déplacement vers
un autre moniteur ou un changement de DPI déclenche un clamp, sans interdire
le resize manuel ni imposer le fullscreen. Aucune persistance de géométrie
n’a été ajoutée. Les matrices natives et mathématiques sont distinguées dans
le rapport Windows.

Les chemins viennent du résolveur Tauri et sont transmis explicitement au
lanceur Python :

| Usage | Résolution |
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

La voie AGPL-3.0 a été approuvée et figure dans `LICENSE`. Les sources
correspondantes, notices transitives et droits CRT restent à vérifier contre
l'artefact final ; voir [MVP_STATUS.md](MVP_STATUS.md). La présence d'un inventaire
ne constitue pas une clôture des obligations de distribution.
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
