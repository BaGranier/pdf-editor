# Conversion locale des PDF

`POST /convert` travaille sur les octets source, dans un temporaire isolé nettoyé
après téléchargement ou erreur. La conversion télécharge son résultat sans
fermer la source ni l'ajouter au viewer. Les modifications non exportées ne sont
pas incluses ; le dialogue le signale.

## Options multipart

| Champ | Valeurs |
| --- | --- |
| `file` | PDF source |
| `target_format` | `docx`, `txt`, `html`, `png`, `jpeg` |
| `languages` | `fra` (défaut), `eng`, `fra+eng` |
| `ocr_mode` | `auto` (défaut), `never`, `always` |
| `pages` | vide/toutes les pages, ou `1-3,5` |
| `image_dpi` | 96, 150 (défaut), 300 |
| `image_quality` | qualité JPEG 1–100, défaut 85 |
| `docx_mode` | `editable` (défaut), `visual` |
| `output_filename` | nom optionnel, sans chemin |

Une image seule est téléchargée directement ; plusieurs pages PNG/JPEG sont
regroupées dans un ZIP avec noms de pages déterministes. Les noms sont nettoyés
côté serveur, limités à 160 caractères et leur extension adaptée au résultat.
`Content-Disposition` fait autorité ; aucun répertoire arbitraire n'est accepté.

## Formats et fidélité

- **DOCX éditable** : reconstruction avec PyMuPDF et python-docx de paragraphes,
  titres, listes, tableaux et images. Espacement relatif pour éviter le clipping
  Word, stratégie de couverture sur pages peu denses. Aucun fallback silencieux
  en capture pleine page quand la couche texte est exploitable. Une rétention de
  moins de 50 % des mots source déclenche un avertissement de conversion dégradée.
- **DOCX visuel** : une image pleine page par page, meilleure conservation de
  l'apparence mais contenu peu éditable.
- **TXT** : UTF-8, ordre de lecture PyMuPDF, séparateur `--- Page N ---`.
- **HTML** : autonome, CSS et images base64 inclus, aucune ressource réseau.
- **PNG/JPEG** : orientation et résolution demandées, JPEG selon la qualité choisie.

Colonnes complexes, équations, polices PAO, widgets et annotations avancées n'ont
pas de fidélité garantie en DOCX éditable. La lisibilité prime sur le maintien
exact du nombre de pages. Comparer les sorties dans Word et LibreOffice pour un
corpus cible ; les tests structurels seuls ne qualifient pas la fidélité visuelle.

## OCR et limites

`auto` conserve les pages numériques et reconnaît les pages sans couche texte
exploitable ; `never` avertit sur les scans ; `always` force l'OCR.
Le sidecar Windows utilise MuPDF/Tesseract et eng/fra embarqués à 200 DPI,
sans deskew/orientation automatique des pixels. Le développement web utilise
OCRmyPDF/Tesseract/Ghostscript système. Architecture et ressources :
[DESKTOP.md](DESKTOP.md), prérequis : [DEVELOPMENT.md](DEVELOPMENT.md).

| Limite | Valeur |
| --- | --- |
| Source | 100 Mio, 500 pages |
| Sortie | 200 Mio |
| Conversion hors OCR | 180 secondes |
| OCR | 600 secondes |
| PDF protégé par mot de passe | Non pris en charge |

Les erreurs exposent un code métier et une étape de traitement, sans contenu
PDF : `INVALID_PDF`, `UNSUPPORTED_TARGET_FORMAT`, `INVALID_PAGE_RANGE`,
`OCR_REQUIRED`, `CONVERSION_FAILED`, `CONVERSION_TIMEOUT`, `OUTPUT_TOO_LARGE`,
`DEPENDENCY_UNAVAILABLE`, `INVALID_OUTPUT_FILENAME`.
Le frontend vérifie un Blob non vide commençant par `%PDF-`, y compris après
restauration IndexedDB. Les réponses publient les métriques via `X-Conversion-*`.

## Validation

Les tests backend ouvrent les DOCX/PDF/ZIP produits ; Playwright vérifie les
téléchargements Chromium/Firefox avant et après restauration. Le contrôle visuel
rend le DOCX avec LibreOffice, mesure pagination/images/styles et crée des vues
comparatives locales. Commandes, fixtures et tests optionnels sur documents
explicitement autorisés : [QA_AUTOMATION.md](QA_AUTOMATION.md).
