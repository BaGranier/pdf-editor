# DESKTOP-RELEASE-001 — shell Tauri et préparation de release

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

| Action | Web | Desktop actuel |
| --- | --- | --- |
| Ouvrir depuis l'interface | sélecteur de fichiers du navigateur | même sélecteur WebView |
| Exporter | téléchargement navigateur | même téléchargement WebView |
| Enregistrer sous | dialogue applicatif de nom, puis téléchargement | même dialogue applicatif et téléchargement |
| Enregistrer après un Save As | nouveau téléchargement au même nom proposé | même comportement : aucun chemin natif n'est mémorisé |

Il n'existe pas encore de permission filesystem ni de plugin de dialogue dans
la capability de la WebView. Ce choix limite volontairement la surface IPC : un
futur adaptateur Desktop devra exposer des commandes Rust minimales et testées
pour choisir un chemin, écrire le PDF exporté et associer ce chemin au document.
Il ne devra pas donner un accès générique au système de fichiers au JavaScript.

Le manifeste Tauri déclare désormais `.pdf` / `application/pdf` comme type que
l'application peut éditer. Cette déclaration prépare les installateurs et
« Ouvrir avec » ; elle ne suffit pas à elle seule à importer les arguments de
lancement dans React. L'ouverture par double-clic, les arguments de démarrage et
le second lancement restent donc non pris en charge tant qu'un flux de chemins
borné et un test natif n'ont pas été livrés.

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

Exemple Debian/Ubuntu pour Tauri et les outils PDF :

```bash
sudo apt-get install build-essential curl wget file libssl-dev \
  libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev \
  libwebkit2gtk-4.1-dev patchelf \
  ghostscript libreoffice-writer ocrmypdf qpdf \
  tesseract-ocr-eng tesseract-ocr-fra
```

Installer les dépendances JavaScript et Python :

```bash
cd apps/web && npm ci
cd ../desktop && npm ci
cd ../../services/pdf-engine && uv sync --locked
```

## Développement

Depuis le workspace desktop :

```bash
cd apps/desktop
npm run desktop:dev
```

Tauri lance Vite via `beforeDevCommand`. Le code Rust choisit un port libre,
crée les répertoires applicatifs et lance directement en debug le backend source
via `uv run python -m app.desktop_server`. Le placeholder exigé par la validation
de `externalBin` n’est donc jamais exécuté en développement. Seul un build
release lance le vrai sidecar produit par PyInstaller.

Le serveur de développement écoute strictement sur
`http://127.0.0.1:5173`. Si ce port est déjà occupé, Vite s’arrête au lieu de
choisir silencieusement 5174 alors que la WebView conserve 5173. À chaque début
et fin de navigation, le terminal Tauri affiche l’URL réellement chargée :

```text
TAURI_WEBVIEW_URL label=main event=Finished url=http://127.0.0.1:5173/
```

Le frontend reçoit l’URL dynamique du backend avec `get_backend_status` et la
passe à React comme une prop typée ; aucune injection de script ni hypothèse sur
le port 8000 n’est utilisée. Le démarrage n’est déclaré prêt qu’après une réponse
valide de `/health`.

Les DevTools sont activés dans les builds debug. Utiliser
`Ctrl+Shift+I` (`Cmd+Option+I` sous macOS), ou les ouvrir automatiquement pour
un diagnostic de démarrage :

```bash
PDF_STUDIO_OPEN_DEVTOOLS=1 npm run desktop:dev
```

Les erreurs de bootstrap frontend apparaissent dans la console avec le préfixe
`[desktop:start:…]`. Une erreur backend ou React affiche également un message
dans la fenêtre, au lieu de laisser une page blanche.

Le mode web reste inchangé :

```bash
cd apps/web
npm run dev
```

Il utilise `VITE_PDF_ENGINE_URL` lorsqu’elle est définie, sinon
`http://localhost:8000`. Il n’importe le pont Tauri qu’en environnement desktop.

### Modes de lecture

Le frontend propose les modes Continu, Page unique et Présentation dans la
WebView. La Présentation demande la Fullscreen API standard sur le root du
viewer lorsqu'elle est supportée ; aucun fullscreen natif spécifique à Tauri
n'est actuellement implémenté. Si la WebView refuse cette API, la Présentation
reste disponible dans toute la surface applicative. `Escape` revient à Page
unique et conserve la page active.

### WSLg et rendu WebKitGTK

Sous WSLg, si la WebView reste blanche alors que le terminal confirme la bonne
URL, relancer d’abord avec le renderer DMA-BUF désactivé :

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run desktop:dev
```

Si le problème dépend toujours du pilote graphique, tester le mode de
composition WebKit désactivé et le rendu logiciel Mesa :

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 \
WEBKIT_DISABLE_COMPOSITING_MODE=1 \
LIBGL_ALWAYS_SOFTWARE=1 \
npm run desktop:dev
```

Ces variables ne changent pas l’application ; elles contournent uniquement le
chemin de rendu WebKitGTK/GL de WSLg.

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
moteur. Il n'embarque pas actuellement les exécutables système appelés par le
parcours OCR (`ocrmypdf`, Tesseract, Ghostscript et QPDF), ni leurs données de
langue. Les bundles produits aujourd'hui ne doivent donc pas être présentés
comme des installateurs autonomes validés pour toutes les fonctionnalités et
toutes les plateformes.

### Stratégie des dépendances OCR et conversion

La stratégie actuelle est **dépendance système détectée au runtime**, sur les
trois OS. Le backend reste l'unique autorité pour le diagnostic : il retourne
des erreurs métier explicites lorsque Tesseract, une langue ou OCRmyPDF manque.
Le viewer, l'édition et l'ouverture de PDF continuent de fonctionner.

| Outil / donnée | Utilisation réelle | Windows | macOS | Linux | Décision de release actuelle |
| --- | --- | --- | --- | --- | --- |
| Tesseract | langues installées et OCR indirect via OCRmyPDF | dépendance système | dépendance système | dépendance système | Ne pas embarquer avant inventaire des binaires, données et notices ; Tesseract est sous Apache-2.0, mais ses dépendances et données doivent être revues séparément. |
| `tessdata` `eng`, `fra` | langues proposées par l'interface | dépendance système | dépendance système | dépendance système | Ne pas présumer de la disponibilité : vérifier `tesseract --list-langs` lors de la QA native. |
| OCRmyPDF | commande OCR appelée par `app/ocr.py` | dépendance système | dépendance système | dépendance système | Pas de bundle ; revue des dépendances transitives et de sa licence MPL-2.0 requise avant redistribution. |
| Ghostscript | dépendance d'OCRmyPDF | dépendance système | dépendance système | dépendance système | Pas de bundle ; décision juridique préalable obligatoire (AGPL ou licence commerciale selon le mode de redistribution). |
| QPDF | dépendance d'OCRmyPDF et des environnements de conversion | dépendance système | dépendance système | dépendance système | Pas de bundle ; vérifier la version, les notices et la licence Apache-2.0 de l'artefact retenu. |
| LibreOffice | validation visuelle DOCX, pas la conversion applicative courante | non requis au runtime | non requis au runtime | non requis au runtime | Réservé à la QA, non distribué avec l'application. |

Ce tableau décrit une stratégie technique, non une autorisation de
redistribution. Toute décision d'empaquetage doit inclure les licences exactes
des versions retenues, les notices, les dépendances transitives et une
validation juridique/distribution par plateforme.

Les artefacts PyInstaller, `target/`, `src-tauri/gen/` et tous les sidecars
générés sont ignorés par Git. On peut préparer manuellement un binaire déjà
construit :

```bash
python3 scripts/prepare-tauri-sidecars.py \
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

Les chemins viennent du résolveur Tauri et sont transmis explicitement au
lanceur Python :

| Usage | Résolution |
| --- | --- |
| données et sorties applicatives | `appLocalDataDir` |
| logs | `appLogDir/pdf-engine.log` |
| cache | `appCacheDir` |
| temporaires | `tempDir/com.local.pdfstudio/backend-<pid>` |

Le backend desktop redirige son ancien `data/output` vers le répertoire de
données applicatif. Il ne doit donc écrire ni dans `data/input`, ni dans
`data/output` du dépôt en application packagée.

## Sécurité locale

- `app.desktop_server` accepte uniquement `127.0.0.1`; `0.0.0.0` est refusé ;
- le port est choisi dynamiquement et la disponibilité est contrôlée par
  `/health` ;
- CORS reste limité aux origines Vite locales et aux origines Tauri connues ;
- le frontend dispose seulement de `core:default`. Aucune permission shell ou
  filesystem n’est exposée par les capabilities ;
- le plugin shell est appelé uniquement depuis le code Rust de confiance pour
  le sidecar déclaré, jamais depuis JavaScript ;
- les logs de démarrage ne contiennent pas le contenu des documents. Les chemins
  applicatifs détaillés ne sont affichés que localement à l’utilisateur en cas
  d’erreur ;
- les temporaires isolés du backend sont nettoyés à son arrêt.

## Vérifications

```bash
cd apps/desktop
npm run desktop:check

# Vérifie la configuration, le frontend et le lanceur backend lorsque Rust/Cargo
# ne sont pas disponibles. Ce n'est pas une validation Tauri native.
npm run desktop:check:static

cd src-tauri
cargo check --locked
```

`desktop:check` valide la configuration et les capabilities, détecte soit le
sidecar courant soit le repli dev, construit le frontend, exécute les tests du
lanceur desktop et lance `cargo check`. `desktop:check:static` effectue les mêmes
contrôles sauf `cargo check` et annonce explicitement cette limite : il est utile
dans un sandbox sans Rust mais ne valide ni le code Rust ni une WebView. Dans un
sandbox qui interdit les sockets loopback, le test `/health` est explicitement
sauté avec le marqueur `desktop_network`; il reste actif en local et en CI
standard.

Validations complètes complémentaires :

```bash
cd services/pdf-engine
UV_CACHE_DIR=/tmp/pdf-engine-uv-cache uv run pytest
UV_CACHE_DIR=/tmp/pdf-engine-uv-cache uv run ruff check .
UV_CACHE_DIR=/tmp/pdf-engine-uv-cache uv lock --check

cd ../../apps/web
npm run test:run
npm run build
npm run lint
npm run typecheck
npm run typecheck:e2e
```

## État du packaging par OS

Le code, les noms de sidecar et la configuration de bundle sont prévus pour
Windows, Linux et macOS. La CI active la validation Linux. Les builds doivent
encore être exécutés nativement sur chaque OS pour produire leur sidecar et leur
bundle ; le cross-compiling du backend Python n’est pas pris en charge.

### Matrice de support de release

Cette matrice décrit l'état vérifié du dépôt, et non une promesse de support.
Les valeurs sont limitées à `OK`, `KO`, `Configuré`, `Non testé`, `Non supporté`
et `Bloqué environnement`. Une configuration déclarative n'est jamais une QA
native.

| Fonction | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Build shell + sidecar | Non testé | Non testé | Non testé |
| Installation / désinstallation | Non testé | Non testé | Non testé |
| Icône et métadonnées bundle | Configuré | Configuré | Configuré |
| Association `.pdf` dans le bundle | Configuré | Configuré | Configuré |
| Double-clic `.pdf` / argument au lancement | Non supporté : argument non importé par React | Non supporté : argument non importé par React | Non supporté : argument non importé par React |
| Second lancement avec un PDF | Non supporté : aucune stratégie single-instance | Non supporté : aucune stratégie single-instance | Non supporté : aucune stratégie single-instance |
| Ouverture depuis l'interface | Non testé : sélecteur WebView | Non testé : sélecteur WebView | Non testé : sélecteur WebView |
| Save As vers une destination native | Non supporté : téléchargement WebView | Non supporté : téléchargement WebView | Non supporté : téléchargement WebView |
| Save vers un chemin déjà choisi | Non supporté : chemin non mémorisé | Non supporté : chemin non mémorisé | Non supporté : chemin non mémorisé |
| Sidecar, port dynamique, health/restart/shutdown | Configuré ; non testé nativement | Configuré ; non testé nativement | Configuré ; non testé nativement |
| OCR `eng` / `fra` | Configuré comme dépendance système ; non testé | Configuré comme dépendance système ; non testé | Configuré comme dépendance système ; non testé |
| Conversion | Configuré ; non testé | Configuré ; non testé | Configuré ; non testé |
| Impression et AcroForms | Non testé | Non testé | Non testé |
| Signature Windows | Non supporté | Non supporté | Non supporté |
| Signature / notarisation macOS | Non supporté | Non supporté | Non supporté |

Il n'existe pas encore d'installateur final validé comme entièrement autonome.
Node.js, Rust/Cargo, Visual Studio Build Tools, MSVC, le Windows SDK, Xcode et le
Python de développement sont des outils de construction, pas des dépendances
fonctionnelles que l'utilisateur final devrait installer. En revanche, tant que
le packaging OCR n'est pas finalisé, une build locale peut encore dépendre des
outils OCR système listés plus haut.

### Procédure de QA native avant release

Exécuter cette procédure sur une machine de chaque OS cible ; un résultat Web
Playwright ne valide pas une WebView Tauri.

1. Installer les prérequis de build de l'OS, Rust >= 1.88, Node 22, `uv` et les
   dépendances OCR de la stratégie retenue.
2. Depuis le dépôt, lancer `cd apps/web && npm ci`, `cd ../desktop && npm ci`,
   puis `cd ../../services/pdf-engine && uv sync --locked`.
3. Lancer `cd apps/desktop && npm run desktop:check`, puis
   `npm run desktop:build` sur l'OS cible. Le sidecar Python est construit pour
   cet OS : ne pas le cross-compiler depuis un autre système.
4. Installer l'artefact généré et vérifier : lancement, health backend,
   ouverture depuis l'interface, édition, Save As WebView, fermeture dirty,
   impression, formulaires, OCR `eng` et `fra`, conversion et arrêt complet.
5. Vérifier les cas de chemin avec espaces et Unicode. Vérifier l'association
   `.pdf` dans l'installateur, puis enregistrer séparément que le double-clic
   reste non supporté tant que le flux d'arguments n'est pas implémenté.
6. Relever la version de chaque dépendance système et le résultat de
   `tesseract --list-langs`; archiver les journaux `pdf-engine.log` si un
   scénario échoue.

La signature Windows, la signature/notarisation macOS et l'auto-update exigent
des credentials et une infrastructure de distribution qui ne sont pas présents
dans ce dépôt. Ils doivent rester `Non supporté` jusqu'à une validation réelle.
