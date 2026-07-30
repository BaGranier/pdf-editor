# Conversion locale des PDF

La conversion est exécutée par le moteur Python local. Le PDF envoyé n’est jamais
modifié : chaque requête travaille dans un répertoire temporaire isolé, supprimé
après le téléchargement ou après une erreur.

## Formats et options

`POST /convert` reçoit un formulaire `multipart/form-data` :

| Champ | Valeurs |
| --- | --- |
| `file` | PDF source |
| `target_format` | `docx`, `txt`, `html`, `png`, `jpeg` |
| `languages` | `fra`, `eng`, `fra+eng` |
| `ocr_mode` | `auto`, `never`, `always` |
| `pages` | vide/toutes les pages, ou une plage telle que `1-3,5` |
| `image_dpi` | `96`, `150`, `300` |
| `image_quality` | qualité JPEG de 1 à 100 |
| `docx_mode` | `editable` (défaut) ou `visual` |
| `output_filename` | nom de téléchargement optionnel, sans chemin |

Plusieurs images sont regroupées dans une archive ZIP avec des noms
déterministes comme `document_page_0001.png`. Une seule page produit directement
une image.

Types MIME téléchargés :

| Résultat | Type MIME |
| --- | --- |
| DOCX | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| TXT | `text/plain; charset=utf-8` |
| HTML | `text/html; charset=utf-8` |
| PNG, une page | `image/png` |
| JPEG, une page | `image/jpeg` |
| PNG/JPEG, plusieurs pages | `application/zip` |

## Noms des téléchargements

Le dialogue propose un nom dérivé du PDF source. Pour `rapport annuel.pdf`, les
valeurs par défaut sont `rapport annuel.docx`, `rapport annuel-visual.docx`,
`rapport annuel.txt` et `rapport annuel.html`. Une image seule porte son numéro
de page, par exemple `rapport annuel-page-003.png`; plusieurs images produisent
`rapport annuel-images.zip`.

L’utilisateur peut modifier ce nom avant la conversion. L’extension est ajoutée
ou corrigée automatiquement selon le résultat réel : `.docx`, `.txt`, `.html`,
`.png`, `.jpg` ou `.zip`. Le nom annoncé par `Content-Disposition` reste
l’autorité au téléchargement ; le nom choisi sert de repli si cet en-tête n’est
pas accessible au navigateur.

Un nom est limité à 160 caractères. Les caractères de contrôle et les caractères
interdits sur les systèmes courants (`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>` et
`|`) ne sont jamais utilisés tels quels côté serveur. Toute composante de chemin
est supprimée, les noms réservés sont neutralisés et un nom source absent devient
`document-converti`. Il n’est pas possible de choisir un répertoire : le
navigateur reste responsable de la destination du téléchargement. Un nom
explicitement vide est refusé avec `INVALID_OUTPUT_FILENAME`; les caractères
dangereux d’un appel API direct sont neutralisés de façon déterministe.

## OCR automatique

Le moteur examine chaque page avant la conversion :

- `auto` conserve les pages numériques et applique l’OCR aux pages image-only ;
- `never` n’exécute pas l’OCR et ajoute un avertissement si une page semble
  numérisée ;
- `always` force l’OCR sur toutes les pages.

Tesseract, OCRmyPDF et les langues demandées doivent être installés sur la
machine pour les modes nécessitant l’OCR. Une dépendance absente produit le code
stable `DEPENDENCY_UNAVAILABLE`.

Sous Debian ou Ubuntu :

```bash
sudo apt-get install ghostscript ocrmypdf qpdf \
  tesseract-ocr-eng tesseract-ocr-fra
```

Le workflow GitHub Actions installe ces paquets avant la campagne.

## Sorties

- DOCX `editable` (« Word éditable ») : paragraphes, titres, styles de texte,
  listes, images à leur taille d'affichage, tableaux et formes simples sont
  reconstruits avec PyMuPDF et `python-docx`. Les blocs longs utilisent la
  largeur utile de la page et restent alignés à gauche ou justifiés ; seuls les
  titres courts réellement centrés conservent un centrage. Les lignes de
  continuation d'une liste restent dans la même puce.
- DOCX `visual` (« Word fidèle visuellement ») : chaque page est rendue comme
  une image pleine page. L'apparence est mieux conservée, mais le contenu est
  moins facilement modifiable. Les paragraphes d'images n'imposent aucune
  hauteur de ligne exacte, afin que Word et LibreOffice ne masquent pas le
  rendu pleine page.
- TXT : UTF-8, ordre de lecture PyMuPDF et séparateur `--- Page N ---`.
- HTML : UTF-8 autonome, CSS inclus, sections par page et images encodées en
  base64 ; aucune ressource réseau.
- PNG/JPEG : rendu dans l’orientation de la page au DPI demandé.

Le mode DOCX éditable tente de conserver la mise en page, mais certains éléments
complexes peuvent être réorganisés. Les colonnes complexes, formulaires,
annotations avancées, équations, polices PAO et la fidélité pixel à pixel ne sont
pas garantis. Le mode visuel privilégie l'apparence au détriment de
l'éditabilité. Le mode éditable ne bascule jamais silencieusement vers le mode
visuel et n'insère pas une capture pleine page lorsqu'une couche texte
exploitable existe. Si `python-docx` permet de relire moins de 50 % des mots de
la couche texte source, la sortie reste éditable mais porte un avertissement de
conversion dégradée.

Les tests ouvrent automatiquement les DOCX avec `python-docx` et vérifient le
texte, les images, les tableaux et les orientations du corpus synthétique. Une
ouverture manuelle sous Microsoft Word et LibreOffice reste recommandée pour
juger la fidélité visuelle, les césures et les variations de mise en page propres
à chaque moteur.

La campagne complète exécute aussi un contrôle visuel synthétique : elle rend le
DOCX en PDF avec LibreOffice headless, compare le nombre de pages, les images et
les marqueurs de style, puis produit des captures côte à côte dans
`apps/web/test-results/docx-visual-quality/`. Ce contrôle requiert
`libreoffice-writer` :

```bash
sudo apt-get install libreoffice-writer
```

## Limites de sécurité

- PDF source : 100 Mo maximum ;
- document : 500 pages maximum ;
- DPI : 96, 150 ou 300 ;
- résultat : 200 Mo maximum ;
- conversion hors OCR : 180 secondes ;
- OCR : 600 secondes selon la configuration existante ;
- PDF protégés par mot de passe : non pris en charge.

Les noms de sortie sont validés et normalisés à nouveau côté serveur. Les erreurs
métier exposent les
codes `INVALID_PDF`, `UNSUPPORTED_TARGET_FORMAT`, `INVALID_PAGE_RANGE`,
`OCR_REQUIRED`, `CONVERSION_FAILED`, `CONVERSION_TIMEOUT`, `OUTPUT_TOO_LARGE`,
`DEPENDENCY_UNAVAILABLE` et `INVALID_OUTPUT_FILENAME`. Une erreur de conversion
contient aussi une étape
stable (`upload_read`, `pdf_validation`, `ocr_auto`,
`docx_editable_generation`, `docx_visual_generation` ou
`response_preparation`) pour retrouver la cause dans les journaux sans exposer
le contenu du document.

Avant l'envoi, le frontend vérifie que la source est un Blob non vide commençant
par `%PDF-`. Après une restauration IndexedDB, un Blob valide est reconstruit
comme `File` nommé et typé `application/pdf`; aucun objet vide ou document
dérivé sans octets PDF n'est envoyé.

## Validation

```bash
cd services/pdf-engine
uv run pytest

cd ../../apps/web
npm run test:run
npm run typecheck
npm run typecheck:e2e
npm run qa:e2e:quick
npm run qa:docx-visual
```

Le document utilisateur de régression reste exclusivement local et est ignoré
par Git sous `data/input/manual-docx-regression/`. Lorsqu'il est disponible, le
test optionnel vérifie avec `python-docx` le texte Word réel, les titres, listes,
images, surlignage et encadré, sans versionner ni le PDF ni le DOCX produit :

```bash
cd services/pdf-engine
QA_REAL_DOCX_PDF=data/input/manual-docx-regression/2-ENGAGEMENT_INDIVIDUEL_ETUDIANT_2026-2027.pdf \
  UV_CACHE_DIR=/tmp/pdf-engine-uv-cache \
  uv run pytest -m docx_real_document
```

Les tests backend ouvrent réellement les DOCX, PDF et archives produits. Les
scénarios Playwright effectuent les téléchargements dans Chromium et Firefox et
alimentent les sections « Conversion locale », « DOCX visual regression » et
« DOCX editable real-document regression » de `QA_AUTOMATED_REPORT.md`. Le
rapport réel ne contient que des mesures agrégées et le nom du fichier, jamais
son texte ni ses octets. Le test navigateur dédié couvre le document
immédiatement après ouverture puis après rechargement/restauration IndexedDB,
dans les modes éditable et visuel.
