# PDF Studio Local

Éditeur PDF local-first, utilisable dans un navigateur ou dans un shell desktop
Tauri. Les documents sont traités sur la machine, sans compte ni stockage distant.
Windows est la cible de la première release ; sa qualification reste incomplète.
Linux et macOS nécessitent une qualification propre.

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

## Documentation de référence

- [DESKTOP.md](DESKTOP.md) : runtime, build, OCR packagé et support par OS.
- [DEVELOPMENT.md](DEVELOPMENT.md) : environnement, contrats et compatibilité persistée.
- [CONVERSION.md](CONVERSION.md) : formats, options et limites de conversion.
- [NATIVE_TEXT_EDITING.md](NATIVE_TEXT_EDITING.md) : spans natifs et registre de polices.
- [QA_AUTOMATION.md](QA_AUTOMATION.md) : tests, scripts et qualification native.
- [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md) : dette structurelle active.
- [NEXT_STEPS.md](NEXT_STEPS.md) : seule roadmap opérationnelle priorisée.
- [SIGNATURE_NUMERIQUE_004.md](SIGNATURE_NUMERIQUE_004.md) : signatures avec certificat, chantier différé.
