# DESKTOP-001 — shell Tauri et backend local

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

cd src-tauri
cargo check --locked
```

`desktop:check` valide la configuration et les capabilities, détecte soit le
sidecar courant soit le repli dev, construit le frontend, exécute les tests du
lanceur desktop et lance `cargo check`. Dans un sandbox qui interdit les sockets
loopback, le test `/health` est explicitement sauté avec le marqueur
`desktop_network`; il reste actif en local et en CI standard.

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

Il n'existe pas encore d'installateur final validé comme entièrement autonome.
Node.js, Rust/Cargo, Visual Studio Build Tools, MSVC, le Windows SDK, Xcode et le
Python de développement sont des outils de construction, pas des dépendances
fonctionnelles que l'utilisateur final devrait installer. En revanche, tant que
le packaging OCR n'est pas finalisé, une build locale peut encore dépendre des
outils OCR système listés plus haut.

DESKTOP-001 ne garantit pas encore :

- l’association PDF par défaut, « Ouvrir avec » ou l’ouverture par double-clic ;
- une boîte de dialogue de sauvegarde native complète ;
- le packaging de toutes les dépendances OCR/conversion sur les trois OS ;
- les installateurs utilisateur finaux ;
- la signature Windows ou la notarisation macOS ;
- l’auto-update.

Ces sujets restent réservés à DESKTOP-002 à DESKTOP-006.
