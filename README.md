# PDF Studio Local

[Documentation](docs/README.md) · [Statut Preview](docs/product/MVP_STATUS.md)
Installation et dossier de redistribution : [Windows Preview](docs/getting-started/WINDOWS_PREVIEW.md).

Éditeur PDF local-first disponible dans un navigateur ou dans une application
desktop Tauri. Les documents restent sur la machine : le frontend communique
uniquement avec le moteur FastAPI local.

La voie de distribution **AGPL-3.0** a été approuvée pour la campagne Windows
006 ; le texte est dans [LICENSE](LICENSE). Les composants tiers conservent leurs
licences. La release Windows reste **NOT READY** : VM clean indisponible,
qualification native incomplète et obligations de redistribution encore à fermer.
La politique et les exigences de sources/notices sont dans
[DESKTOP.md](docs/architecture/DESKTOP.md#distribution-windows-et-licences).

## Capacités actuelles

- Lecture, miniatures, recherche et navigation multi-document. Le sélecteur
  propose Continu, Page unique, Présentation, Double page et Multipage automatique.
- Liens PDF web et internes, sommaires imprimés contenant de vrais liens et
  signets hiérarchiques. Création, édition et suppression de liens dans
  **Texte → Lien**, avec historique et export PDF natif.
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

Voir la [référence de l’éditeur](docs/user/editor-reference.md) pour les modes de lecture, les outils, les images et les limites d’usage.

## PDF protégés

Le dialogue permet une saisie masquée, une annulation et de nouvelles tentatives.
Après authentification, le PDF est ouvert en **session temporaire**. La reprise
du navigateur ne contient ni sa copie déchiffrée ni les résultats PDF rouverts
automatiquement. Pour produire une sortie chiffrée, utilisez **Exporter /
Finaliser** et choisissez un secret AES-256 distinct. Le guide décrit la
suppression ciblée des anciennes copies et les limites de stockage.
[PDF protégés et sauvegarde](docs/user/document-workflows.md)

## Démarrer

Environnement de référence : Node **22**, Python **>= 3.11** et uv ; Rust
**>= 1.90** pour Tauri. Les dépendances sont verrouillées par les lockfiles de
chaque workspace. Prérequis OCR système et conteneur :
[DEVELOPMENT.md](docs/getting-started/DEVELOPMENT.md).

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

Pour Tauri, installer aussi les dépendances natives de [DESKTOP.md](docs/architecture/DESKTOP.md),
puis lancer `npm ci` et `npm run desktop:dev` depuis `apps/desktop`.

## Vérifier

Les commandes de test, les fixtures synthétiques et les critères de réussite
sont dans [QA_AUTOMATION.md](docs/qa/QA_AUTOMATION.md). Pour les preuves historiques
et les validations Windows en attente, consulter l’[index QA](docs/qa/README.md).
Depuis la racine, `python scripts/check-doc-links.py` vérifie les liens internes.

## Sauvegarder, exporter et finaliser

Dans le navigateur, vérifiez le fichier téléchargé puis confirmez
**J’ai enregistré cette copie**. Sur Desktop, le premier **Enregistrer**
ouvre **Enregistrer sous** et préserve l’original. Les annulations et les
échecs conservent les modifications. Consultez les
[parcours d’enregistrement](docs/user/document-workflows.md#enregistrement-et-export).
En Preview Windows, exportez la copie composée puis imprimez-la dans un lecteur externe.

## Structure

React, Vite et PDF.js se trouvent dans `apps/web`, le shell Rust/Tauri dans
`apps/desktop` et le moteur FastAPI/PyMuPDF dans `services/pdf-engine`.
Les documents utilisateur dans `data/input` et les sorties dans `data/output`
restent ignorés par Git. Les fixtures synthétiques sont dans `apps/web/e2e/fixtures`.
