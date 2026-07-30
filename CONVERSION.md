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

- DOCX : paragraphes, titres simples, images, tableaux simples, sauts de page et
  orientations sont reconstruits avec PyMuPDF et `python-docx`.
- TXT : UTF-8, ordre de lecture PyMuPDF et séparateur `--- Page N ---`.
- HTML : UTF-8 autonome, CSS inclus, sections par page et images encodées en
  base64 ; aucune ressource réseau.
- PNG/JPEG : rendu dans l’orientation de la page au DPI demandé.

La conversion DOCX tente de conserver la mise en page, mais certains éléments
complexes peuvent être réorganisés. Les colonnes complexes, formulaires,
annotations avancées, équations, polices PAO et la fidélité pixel à pixel ne sont
pas garantis.

Les tests ouvrent automatiquement les DOCX avec `python-docx` et vérifient le
texte, les images, les tableaux et les orientations du corpus synthétique. Une
ouverture manuelle sous Microsoft Word et LibreOffice reste recommandée pour
juger la fidélité visuelle, les césures et les variations de mise en page propres
à chaque moteur.

## Limites de sécurité

- PDF source : 100 Mo maximum ;
- document : 500 pages maximum ;
- DPI : 96, 150 ou 300 ;
- résultat : 200 Mo maximum ;
- conversion hors OCR : 180 secondes ;
- OCR : 600 secondes selon la configuration existante ;
- PDF protégés par mot de passe : non pris en charge.

Les noms de sortie sont générés côté serveur. Les erreurs métier exposent les
codes `INVALID_PDF`, `UNSUPPORTED_TARGET_FORMAT`, `INVALID_PAGE_RANGE`,
`OCR_REQUIRED`, `CONVERSION_FAILED`, `CONVERSION_TIMEOUT`, `OUTPUT_TOO_LARGE`
et `DEPENDENCY_UNAVAILABLE`.

## Validation

```bash
cd services/pdf-engine
uv run pytest

cd ../../apps/web
npm run test:run
npm run qa:e2e:quick
```

Les tests backend ouvrent réellement les DOCX, PDF et archives produits. Les
scénarios Playwright effectuent les téléchargements dans Chromium et Firefox et
alimentent la section « Conversion locale » de `QA_AUTOMATED_REPORT.md`.
