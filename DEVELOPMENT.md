# Développement et contrats locaux

## Environnement

Le devcontainer utilise le service `dev` de `docker-compose.yml`, construit depuis
`Dockerfile.dev` (Node 22 Bookworm), avec le dépôt dans `/workspace` et l'utilisateur
`node`. Il fournit Python, uv, les outils de compilation Debian, QPDF, Poppler,
Ghostscript, OCRmyPDF, Tesseract eng/fra et LibreOffice. Rust et WebKitGTK ne sont
pas installés : le build Tauri demande les prérequis de [DESKTOP.md](DESKTOP.md).

Les caches npm/pip/uv et la configuration locale de l'agent sont des volumes
persistants ; ne pas copier les secrets ou fichiers d'authentification dans Git.
Les versions de uv et de la CLI installée ne sont pas épinglées par le Dockerfile.
Les dépendances applicatives sont contrôlées par les lockfiles npm, uv et Cargo.

Les ports hôte `5173`/`8000` sont publiés sur `127.0.0.1`. Dans le conteneur,
lancer Vite/FastAPI avec `--host 0.0.0.0` selon le [README](README.md).
Le compose n'expose pas le socket Docker ; son profil `SYS_ADMIN`, seccomp et
AppArmor désactivés est réservé au développement.

Pour le parcours OCR système Debian/Ubuntu :

```bash
sudo apt-get install ghostscript ocrmypdf qpdf \
  tesseract-ocr-eng tesseract-ocr-fra libreoffice-writer
```

QPDF contrôle les résultats PDF ; LibreOffice rend les DOCX pour la QA et
n'est pas appelé par la conversion applicative. Pour Tesseract système,
`TESSDATA_PREFIX` doit contenir langues, `configs` et `tessconfigs`.
Le runtime gelé a une stratégie distincte décrite dans [DESKTOP.md](DESKTOP.md).

Commandes d'installation/lancement : [README.md](README.md).
Fixtures, navigateurs et tests : [QA_AUTOMATION.md](QA_AUTOMATION.md).
Les données privées restent sous `data/input`, les résultats sous `data/output` ;
les deux sont ignorés. Les fixtures versionnées sont exclusivement synthétiques.

## API et composition PDF

Les clients typés se trouvent dans `apps/web/src/api`, `saving`, `pdf`, `ocr` et
`conversion`. FastAPI expose `/health`, `/pdf/export/organize`, `/ocr`, `/convert`,
`/pdf/forms` et les routes `/pdf/native-text*`. Les schémas Pydantic sont dans
`app/main.py` et les modules métier ; la documentation API locale est sur `/docs`.

L'export organisé reçoit en multipart :

- `files` et `documentIds` JSON dans le même ordre ;
- `plan` JSON : pages source (`sourceDocumentId`, `sourcePageIndex` zéro-based,
  `rotation` orthogonale), edits et options ;
- `imageFiles` et `imageIds` pour les assets binaires uniques, hors du champ JSON.

`PdfEdit[]` est la source de vérité de l'ordre des objets ajoutés ; le payload
en dérive `order`, puis le backend compose les objets visuels dans cet ordre.
Le contenu PDF source reste la base. Markups locaux exportés en vecteurs et
marqueurs de commentaires participent à l'ordre ; le contenu du commentaire est
conservé dans une annotation cachée. Les annotations préexistantes gardent leur
couche PDF et ne sont pas réordonnables comme objets locaux.

L'export ne modifie pas les fichiers source. `saveToOutputDir: true` demande une
copie facultative sans écrasement dans la sortie locale ; un échec de copie porte
`X-Pdf-Output-Warning` sans supprimer le téléchargement. En desktop, cette sortie
est redirigée vers les données applicatives. La destination native est gérée par
Rust, séparément de cette copie de développement.

Les profils maximum/équilibré/réduit optimisent les flux et, pour les deux derniers,
recompressent les images sans rasterisation globale : cibles 180/100 DPI,
seuils 225/125 DPI et qualités 85/65. Aucun gain universel n'est garanti.
Aplatissement des formulaires et annotations : options explicites distinctes,
perte d'interactivité et possible perte des données de commentaires/pièces jointes.
AES-256 : secrets éphémères, permissions non garanties par les lecteurs tiers ;
la sortie chiffrée est téléchargée/enregistrée sans réouverture automatique.

## Persistance et compatibilité

`apps/web/src/storage/viewerStorage.ts` maintient `pdf-editor-mvp-db` **v2** :
upgrade additif depuis v1, documents et assets dans des stores dédiés, écriture
transactionnelle. Les préférences utilisent aussi localStorage. En cas de quota,
la session peut rester utilisable sans garantie de restauration.

Les images sont référencées par ID SHA-256 et partagées avec les signatures,
sans duplication par instance/historique. Le pruning tient compte des documents,
undo/redo, signature en attente et presse-papiers. L'historique de session est borné
à 100 snapshots. Le crop normalisé `{x,y,width,height}` est non destructif.
Les documents ouverts par identifiant natif et les destinations Tauri ne sont
pas restaurés depuis IndexedDB.

Compatibilité à préserver lors d'une évolution :

- v1/v2 sans edits complets : reprise des champs historiques texte natif/formulaires ;
- crop absent : image entière ; aspect-lock absent : ratio historique ;
- plans absents : ordre stable historique ; anciennes formes/signatures conservées ;
- payload `schemaVersion: 2` émis actuellement ; backend accepte aussi v1,
  sans version/options : defaults historiques ; petits assets dataURL encore acceptés.

Avant modification de ces formats, rejouer `storage-upgrade.spec.ts`,
`persistence.spec.ts` et les tests de stockage/payload/backend concernés.
Ne recréer `packages/shared` que pour un contrat généré ou indépendant du langage
avec au moins deux consommateurs ; pas de modèles Python/TypeScript dupliqués.

## Budgets et rendu

Avertissements configurables au build : 50 Mo/PDF, 250 pages/PDF, 8 documents
ouverts (`VITE_PDF_RECOMMENDED_MAX_SIZE_MB`, `VITE_PDF_RECOMMENDED_MAX_PAGE_COUNT`,
`VITE_PDF_RECOMMENDED_MAX_OPEN_DOCUMENTS`). Ils ne bloquent pas l'ouverture/export.

Images : PNG/JPEG, 32 Mio compressés/asset, 40 Mpx, 20 000 pixels/axe ; cumul
192 Mio compressés et 512 Mio RGBA estimés pour les assets uniques, 128 assets
maximum/export. Les dimensions sont vérifiées avant décodage. Ces budgets
ne mesurent pas la RAM totale/GPU ; SVG/WebP et rotation image dédiée sont absents.
Sources : `images/imagePolicy.ts`, `app/image_dimensions.py` et `app/main.py`.

PDF.js conserve le viewport CSS pour les overlays et dimensionne les canvases
selon le DPR. Continu matérialise les pages visibles plus deux pages de marge ;
Page unique/Présentation utilisent au maximum deux buffers de page, sans cache
bitmap des pages visitées. Le swap attend la frame complète et rejette les rendus
obsolètes. Viewer/toolbar/inspecteur possèdent leurs scrolls ; le shell ne doit
pas créer de scroll global. Les tests de rendu et responsive sont dans
[QA_AUTOMATION.md](QA_AUTOMATION.md).
