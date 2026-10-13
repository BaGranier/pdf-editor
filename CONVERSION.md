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
| PDF protégé par mot de passe | Ouvrir et authentifier dans l’éditeur avant conversion/OCR |

Les erreurs exposent un code métier et une étape de traitement, sans contenu
PDF : `INVALID_PDF`, `UNSUPPORTED_TARGET_FORMAT`, `INVALID_PAGE_RANGE`,
`OCR_REQUIRED`, `CONVERSION_FAILED`, `CONVERSION_TIMEOUT`, `OUTPUT_TOO_LARGE`,
`DEPENDENCY_UNAVAILABLE`, `INVALID_OUTPUT_FILENAME`.
Le frontend vérifie un Blob non vide commençant par `%PDF-`, y compris après
restauration IndexedDB. Les réponses publient les métriques via `X-Conversion-*`.

## Correction d’orientation OCR

`POST /ocr` accepte un champ multipart optionnel `rotation` (défaut `0` ;
`90`, `180`, `270` degrés horaires). Les anciens payloads restent valides.
Le dialogue propose la même correction sur Web et Desktop. Elle s’applique aux
pixels de toutes les pages source, indépendamment du plan d’organisation édité.
Utiliser 270° pour corriger un scan tourné de 90° horaire. À 90°/270°, largeur
et hauteur sont échangées ; nombre de pages et échelle physique sont conservés.
La correction travaille sur un temporaire dans un worker supervisé, sans modifier
l’original ; timeout/erreur/arrêt conservent la source. Les rotations PDF existantes
restent gérées par le pipeline embarqué lorsque la correction vaut zéro.

Le deskew OCRmyPDF système reste optionnel. MuPDF 1.26.3 ne fournit pas d’option
deskew via `Pixmap.pdfocr_tobytes` ; aucun binaire ni dépendance supplémentaire
n’est ajouté au package. Le dialogue desktop désactive cette option et le backend
retourne `OCR_DESKEW_UNAVAILABLE` si elle est demandée. Aucune détection automatique
d’orientation n’est annoncée ; des orientations différentes selon les pages
demandent encore une préparation séparée. La conversion automatique ne reprend
pas les options du dialogue OCR : convertir le PDF OCR produit pour les utiliser.

Le corpus `ocr-oriented-*` couvre 0/90/180/270°, ±3°, faible contraste et trois
pages mixtes français/anglais ; les fixtures `conversion-scan*` couvrent aussi
les langues séparément. Les tests contrôlent témoins, accents `été`/`café`, ordre
des lignes OCR et dimensions, puis rouvrent avec PyMuPDF et pypdf. Espaces sont
normalisés pour les témoins ; extraction sans tri géométrique pour l’ordre OCR.
D’autres accents et mots peuvent rester mal reconnus (par exemple ç ou « line ») ;
ce corpus n’est pas une garantie sur des scans réels et ne définit aucun CER/WER.

Mesures reproductibles : `pytest tests/test_ocr_orientation.py -s` avec ressources
eng/fra verrouillées (appel direct du worker MuPDF, hors lancement/API). Sur Linux, page droite MuPDF ≈0,28–0,74 s, rotations corrigées
≈0,35–0,73 s, inclinaisons ≈0,31–0,66 s, trois pages ≈0,78–1,91 s ; sorties
≈98–168 ko/page, ≈378 ko pour trois pages. OCRmyPDF 14.0.1 sur ce même corpus :
≈0,71–0,74 s/page sans deskew, ≈0,95–1,15 s avec ; trois pages ≈1,56 contre 2,71 s.
Sans correction, les témoins des trois rotations sont absents ; après correction,
ils sont retrouvés avec les six mots accentués contrôlés. Le gain des témoins sur ±3° ne justifie pas une nouvelle dépendance embarquée.
Mesure isolée sans PATH via `scripts.measure-ocr-orientation` : CPU ≈0,30 s pour
la page droite, ≈0,31–0,34 s après correction (contre ≈0,55–0,93 s avant),
≈0,92 s pour trois pages ; pic RSS du processus ≈93–95 Mo/page et 112 Mo pour
trois pages. Artefacts ignorés : `data/output/protection-ocr-007/metrics.json`.
Ces durées ponctuelles varient selon la machine et la concurrence. Le plafond
embarqué reste 40 millions de pixels/page à 200 DPI (120 Mo pour le seul buffer
RGB, hors buffers OCR) ; la correction préalable réutilise le contenu PDF sans
allouer une seconde image pleine page dans le parent.

Les erreurs d’ouverture distinguent `PDF_PASSWORD_REQUIRED`,
`PDF_PASSWORD_INVALID`, `PDF_PERMISSION_DENIED` et, lorsque le moteur le distingue,
`PDF_ENCRYPTION_UNSUPPORTED`. Un document illisible reste `INVALID_PDF`.
Une rotation invalide retourne `OCR_ORIENTATION_UNAVAILABLE` ; l’échec d’un worker
retourne `OCR_FAILED`, sans exception brute dans l’interface.

## Validation

Les tests backend ouvrent les DOCX/PDF/ZIP produits ; Playwright vérifie les
téléchargements Chromium/Firefox avant et après restauration. Le contrôle visuel
rend le DOCX avec LibreOffice, mesure pagination/images/styles et crée des vues
comparatives locales. Commandes, fixtures et tests optionnels sur documents
explicitement autorisés : [QA_AUTOMATION.md](QA_AUTOMATION.md).
