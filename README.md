# PDF Studio Local

État de la version MVP : voir [MVP_STATUS.md](MVP_STATUS.md).
Installation et dossier de redistribution : [Windows Preview](WINDOWS_PREVIEW.md).

Éditeur PDF local-first disponible dans un navigateur ou dans une application
desktop Tauri. Les documents restent sur la machine : le frontend communique
uniquement avec le moteur FastAPI local.

La voie de distribution **AGPL-3.0** a été approuvée pour la campagne Windows
006 ; le texte est dans [LICENSE](LICENSE). Les composants tiers conservent leurs
licences. La release Windows reste **NOT READY** : VM clean indisponible,
qualification native incomplète et obligations de redistribution encore à fermer.
La politique et les exigences de sources/notices sont dans
[DESKTOP.md](DESKTOP.md#distribution-windows-et-licences).

## Structure

- `apps/web`: Vite + React + TypeScript frontend
- `apps/desktop`: Tauri v2 native shell and local backend lifecycle
- `services/pdf-engine`: FastAPI backend
- `apps/web/e2e/fixtures`: fixtures QA synthétiques et versionnées
- `data/input`: documents d'entrée locaux, entièrement ignorés par Git
- `data/output`: documents générés localement, entièrement ignorés par Git

Le développement et le packaging natifs sont documentés dans
[DESKTOP.md](DESKTOP.md).

Le shell de développement Linux a été démarré avec WebView et sidecar sur Ubuntu
22.04.5 LTS. Le bundle, les dialogues interactifs de fichiers et l'association
système `.pdf` restent explicitement à qualifier avant de présenter Linux comme
supporté en production.

## Capacités actuelles

- Lecture, miniatures, recherche, navigation multi-document ; modes Continu,
  Page unique et Présentation avec transition à deux buffers.
- Texte ajouté et édition limitée du texte natif, polices locales, signatures
  graphiques, images PNG/JPEG avec crop non destructif, formes et dessin libre.
- Plans/transparence des objets ajoutés, commentaires, markup et undo/redo.
- AcroForms standards : valeurs et verrou ReadOnly ; pas de XFA ni de sauvegarde
  des valeurs après réorganisation des pages.
- Organisation/composition multi-source ; sauvegarde desktop native avec Save As
  initial préservant la source, téléchargement de copies dans le navigateur.
- Export avec compression, aplatissement explicite formulaires/annotations,
  AES-256 et permissions ; ouverture des PDF protégés avec saisie ponctuelle.
- OCR local eng/fra/mixte embarqué dans le sidecar Windows ; conversion DOCX,
  TXT, HTML, PNG/JPEG, correction manuelle des scans tournés et aperçu d'impression de l'état courant.

La signature graphique, le chiffrement et l'aplatissement sont distincts de la
signature cryptographique avec certificat, qui n'est pas implémentée. La fidélité
DOCX complexe et la qualité OCR dépendent du document. Les permissions PDF peuvent
être ignorées par des lecteurs tiers.

## PDF protégés

La saisie masquée permet annulation et nouvelles tentatives. Le mot de passe
transite uniquement dans un formulaire POST vers le moteur local ; il n’est
conservé ni dans IndexedDB, ni dans les préférences, ni dans undo/redo ou les logs.
Après authentification, l’éditeur utilise une copie déchiffrée : comme les autres
PDF ouverts, **cette copie de travail peut être conservée dans IndexedDB**.
Le fichier original reste intact. Save / Save As produisent une copie non chiffrée ;
Exporter / Finaliser permet un nouveau chiffrement AES-256 avec un secret choisi
séparément. Le mot de passe d’ouverture n’est jamais réutilisé pour la sortie.
Si les permissions ne permettent pas tous les outils exposés (édition, copie,
annotations, formulaires, assemblage et impression), le mot de passe propriétaire
est requis. Le mode lecture seule des PDF restreints n’est pas proposé.

## Architecture

| Répertoire | Responsabilité |
| --- | --- |
| `apps/web` | React / Vite / TypeScript, viewer PDF.js et persistance IndexedDB |
| `apps/desktop` | Tauri v2 / Rust, fichiers natifs et supervision du sidecar |
| `services/pdf-engine` | FastAPI / Python / PyMuPDF, pypdf et python-docx |
| `scripts` | Fixtures, packaging et pilotes QA |

Tests : Vitest, Playwright Chromium/Firefox, pytest et Rust.
Les documents utilisateur restent dans `data/input`, les sorties dans
`data/output` (ignorés). Seules les fixtures synthétiques reproductibles vont
dans `apps/web/e2e/fixtures`.

## Démarrer

Environnement de référence : Node **22**, Python **>= 3.11** et uv ; Rust
**>= 1.88** pour Tauri. Les dépendances sont verrouillées par les lockfiles de
chaque workspace. Prérequis OCR système et conteneur :
[DEVELOPMENT.md](DEVELOPMENT.md).

Dans deux terminaux, depuis la racine :

```bash
cd services/pdf-engine
uv sync --locked
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

```bash
cd apps/web
npm ci
npm run dev -- --host 127.0.0.1
```

Ouvrir `http://localhost:5173`. Le backend répond sur `/health`.
Dans le devcontainer, remplacer les deux hôtes par `0.0.0.0` pour les mappings
locaux de ports. Le serveur desktop reste exclusivement sur loopback.

Pour Tauri, installer aussi les dépendances natives de [DESKTOP.md](DESKTOP.md),
puis lancer `npm ci` et `npm run desktop:dev` depuis `apps/desktop`.

## Vérifier

```bash
cd apps/web
npm test -- --run
npm run build
npm run typecheck:e2e
npm run qa:e2e:quick
```

```bash
cd services/pdf-engine
uv run pytest
uv run ruff check .
```

La préparation sur clone neuf et les dépendances QA sont décrites dans
[QA_AUTOMATION.md](QA_AUTOMATION.md). Le runner prépare automatiquement les
fixtures synthétiques manquantes et valide celles déjà présentes.
Les commandes desktop et les gates de release sont dans les documents suivants.

### Sauvegarder, exporter et finaliser

Le premier **Enregistrer / Ctrl+S** d'un document ouvert lance **Enregistrer
sous…** en Desktop. Après réussite, les prochains Ctrl+S écrivent atomiquement
vers cette copie pendant la session. La destination d'ouverture n'est jamais
choisie implicitement ; les destinations natives ne sont pas restaurées depuis
IndexedDB. **Ctrl+Shift+S** permet de choisir une autre destination, même sans
modification. Annulation et erreur conservent l'état modifié.

En web, ces actions proposent un nom puis téléchargent une copie. Le navigateur
ne permet pas de réécrire directement une destination déjà choisie.
`data/output` reste une sortie de développement facultative. Le shell Tauri
possède ses dialogues natifs et identifiants de fichiers opaques ; leur statut
par plateforme est détaillé dans [DESKTOP.md](DESKTOP.md).

**Image** insère un PNG ou JPEG local. Les dimensions sont vérifiées avant
décodage : 40 millions de pixels et 20 000 pixels par axe. Le budget de lecture
compressée est 32 Mio par asset, avec 192 Mio compressés et 512 Mio RGBA estimés
pour les assets uniques de la session ; aucune limite de champ multipart à
1 Mio ne s'applique aux nouveaux imports. Les originaux ne sont pas dégradés
systématiquement. L'image est centrée, bornée à 60 % de la page et librement
redimensionnable ; Shift ou **Conserver les proportions** verrouille son ratio.
**Rogner l’image** permet de déplacer/redimensionner un cadre, valider, annuler
avec Escape ou rétablir l'image entière, avec undo/redo. Le crop est non destructif
et persiste avec les documents web restaurables. Les documents natifs ouverts
par identifiant Tauri restent volontairement limités à la session.
Le panneau **Plans des objets ajoutés** permet de
sélectionner un objet couvert et de le placer devant/derrière les autres edits.
Le contenu PDF original reste la base. Carré et cercle gardent une géométrie 1:1 ;
les extrémités du trait/flèche sont déplaçables. Les markups locaux participent
au même ordre que les formes et sont exportés comme vecteurs ; les annotations
déjà présentes dans le PDF source conservent leur comportement PDF.
Les images n'ont pas d'outil de
rotation dédié ; SVG et WebP ne sont pas acceptés.

**Exporter / Finaliser…** propose :

| Profil | Politique |
| --- | --- |
| Qualité maximale | optimisation des flux/objets sans recompression destructive des images |
| Équilibré | images à haute résolution : cible 180 DPI, seuil 225 DPI, qualité 85 |
| Taille réduite | images à haute résolution : cible 100 DPI, seuil 125 DPI, qualité 65 |

Les images RGB/gris source et ajoutées peuvent être recompressées, une fois par
ressource et selon leur plus grand placement. Masques/transparence, couleurs
complexes et images de plus de 40 millions de pixels conservent leurs données.
Le texte reste sélectionnable et les vecteurs
restent vectoriels. Aucune réduction de taille universelle n'est garantie.
Le rapport affiche les tailles source/export et le profil sans promettre un gain.
Les profils Équilibré/Taille réduite remplacent les images par référence PDF,
sans réécrire les flux de page : le gate 006 a reproduit une corruption des
polices et un sous-échantillonnage répété avec `rewrite_images` de MuPDF 1.26.3.

Les edits ajoutés sont déjà intégrés au PDF. L'aplatissement des **formulaires**
et celui des **annotations** sont deux options explicites : ils conservent leur
apparence et suppriment leur interactivité ; celui des annotations peut perdre
commentaires et pièces jointes. Les annotations sont conservées par défaut.
La protection utilise AES-256, un mot de passe d'ouverture facultatif et des
permissions d'impression/modification avec mot de passe propriétaire distinct.
Ces permissions peuvent être ignorées par d'autres logiciels. Les secrets ne
sont ni persistés ni journalisés. Une sortie chiffrée est enregistrée/téléchargée
sans réouverture automatique : l'éditeur n'offre pas encore le dialogue de
mot de passe à l'ouverture d'un PDF protégé.

Une signature graphique est une image manuscrite. **La signature numérique avec
certificat n'est pas livrée** : audit et critères sont dans
[SIGNATURE_NUMERIQUE_004.md](SIGNATURE_NUMERIQUE_004.md).

Validation WSL : voir [le rapport du ticket 003](QA_EDITOR_EXPORT_PRESENTATION_003.md).
La requalification Windows installée et ses limites clean/1080×1900 sont dans
[le rapport 004](QA_WINDOWS_CLEAN_INTEGRATION_004.md).
Les rapports Windows précédents restent des photographies historiques.

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
