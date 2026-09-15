# Environnement de développement

Le dépôt peut être utilisé directement sur l'hôte ou dans le devcontainer. Ce
document décrit l'environnement réellement configuré ; les commandes propres au
produit restent détaillées dans `README.md`, `QA_AUTOMATION.md` et `DESKTOP.md`.

## Devcontainer actuel

Le fichier `.devcontainer/devcontainer.json` utilise le service `dev` de
`docker-compose.yml`. Celui-ci construit `Dockerfile.dev` à partir de l'image
`mcr.microsoft.com/devcontainers/javascript-node:22-bookworm` et ouvre le dépôt
dans `/workspace` avec l'utilisateur `node`.

L'image installe :

- Python 3 et les outils de création d'environnements virtuels ;
- `uv`, installé par le script officiel Astral dans
  `/home/node/.local/bin` ;
- QPDF, Poppler, Ghostscript et OCRmyPDF ;
- Tesseract avec les données de langue anglaises et françaises ;
- LibreOffice pour les contrôles visuels DOCX ;
- Git, curl, tmux, zsh, bubblewrap et les outils de compilation Debian ;
- la CLI Codex. La création du devcontainer vérifie également la CLI via son
  `postCreateCommand`.

Les versions de `uv` et de la CLI Codex ne sont pas épinglées dans le
Dockerfile. Les dépendances applicatives, elles, restent contrôlées par les lock
files du frontend, du desktop et du backend.

Le devcontainer n'installe ni Rust/Cargo, ni les bibliothèques WebKitGTK requises
pour compiler Tauri sous Linux. Il couvre donc le développement web/backend et
la QA navigateur, mais pas à lui seul `npm run desktop:check` ou
`npm run desktop:build`. Les prérequis natifs sont dans `DESKTOP.md`.

## Volumes, ports et caches

Le compose monte :

| Emplacement | Rôle |
| --- | --- |
| dépôt courant vers `/workspace` | sources et working directory |
| `codex-home` vers `/home/node/.codex` | configuration locale persistante de Codex |
| `node-cache` vers `/home/node/.npm` | cache npm |
| `pip-cache` vers `/home/node/.cache/pip` | cache pip |
| `uv-cache` vers `/home/node/.cache/uv` | cache uv |

Les ports `5173` et `8000` sont publiés uniquement sur `127.0.0.1` côté hôte.
Pour rendre les serveurs joignables à travers ces mappings, utiliser les
commandes du README avec `--host 0.0.0.0` dans le conteneur.

Aucun socket Docker n'est monté. Le profil compose ajoute cependant
`SYS_ADMIN` et désactive les profils seccomp et AppArmor pour le conteneur de
développement. Ce profil est plus permissif qu'un conteneur de production et ne
doit pas être réutilisé comme configuration de déploiement.

## Installation du dépôt

Après création du conteneur :

```bash
cd /workspace/apps/web
npm ci

cd /workspace/apps/desktop
npm ci

cd /workspace/services/pdf-engine
uv sync --locked
```

Les navigateurs Playwright ne sont pas installés par `Dockerfile.dev`. Pour la
QA navigateur :

```bash
cd /workspace/apps/web
PLAYWRIGHT_BROWSERS_PATH=/workspace/.playwright-browsers \
  npx playwright install chromium firefox
npm run qa:e2e:quick
```

Les PDF de QA reproductibles sont générés sous `apps/web/e2e/fixtures`. Les
résultats Playwright, téléchargements et rapports générés restent sous
`apps/web/test-results` et sont ignorés par Git.

## Rendu du viewer

Les modes Continu, Page unique et Présentation partagent le même rendu PDF.js.
Le canvas conserve sa taille CSS correspondant au viewport PDF, tandis que son
backing store est dimensionné avec `window.devicePixelRatio`. PDF.js est rerendu
après un changement de zoom, de fit, de redimensionnement ou de fullscreen ; la
text layer et les overlays continuent à utiliser le viewport CSS. Cette logique
est commune à Chromium et Firefox.

## Données locales et secrets

- placer les documents utilisateur dans `data/input`, qui est ignoré hormis son
  `.gitkeep` ;
- conserver les sorties locales dans `data/output`, également ignoré hormis son
  `.gitkeep` ;
- ne pas utiliser `apps/web/e2e/fixtures` pour des documents personnels : ce
  dossier est réservé aux fixtures synthétiques reproductibles ;
- ne pas copier les identifiants ou fichiers d'authentification du volume
  `codex-home` dans le dépôt ;
- ne pas effectuer de connexion Codex pendant la construction de l'image.
