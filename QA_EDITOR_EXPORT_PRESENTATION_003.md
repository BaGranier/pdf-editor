# EDITOR-FEATURES-EXPORT-PRESENTATION-003 — Rapport WSL

Date : 2026-10-08. Branche de départ : `main`, base `ab71159`.
Documents utilisés : uniquement fixtures synthétiques reproductibles.
Modification préexistante préservée : une ligne locale de `.gitignore`.
Aucun push. Aucun rapport Windows historique modifié.

## Implémentation

- **Save As par défaut** : premier Ctrl+S natif après ouverture → Save As ;
  réussite → destination opaque de session ; suivants → sauvegarde directe dans
  cette copie. Source et destination sont distinctes. Save As explicite disponible
  même sans modification. Annulation/échec conservent dirty. Le web télécharge une
  copie nommée et ne possède pas de destination locale directement réinscriptible.
- **Images** : PNG/JPEG, sélection immédiate, déplacement, resize avec ratio,
  suppression et undo/redo. JPEG EXIF normalisé pour correspondre au rendu exporté.
  Limites : 5 Mio, 40 M pixels, 20 000 pixels/axe. Pas de SVG/WebP ni de nouvelle
  architecture de rotation. Taille naturelle en points (petites images agrandies à 30 points par axe lorsque
  le ratio et la page le permettent), centrée et bornée à 60 %
  de la page ; les ratios extrêmes peuvent limiter la taille manipulable.
- **Plans/transparence** : quatre actions dans l'inspecteur, liste permettant de
  sélectionner un objet couvert, alpha réel et ordre partagé avec l'export.
  Les changements de plans sont historisés et rendent dirty.
- **Carré/cercle** : modes explicites ; contrainte 1:1 à la création et au resize,
  propriétés partagées avec rectangle/ellipse. Aucun nouveau raccourci Shift.
- **Flèches** : modèle ligne optionnellement fléché, extrémités PDF explicites,
  pointe vectorielle orientée/proportionnée. Trait historique conservé.
- **Compression** : maximum/équilibré/taille réduite, optimisation des flux,
  recompression/downsampling d'images source et ajoutées selon profil. Pas de
  rasterisation globale ; texte et vecteurs conservés. Mesures ci-dessous.
- **Finalisation/sécurité** : edits intégrés ; flatten formulaires et annotations
  séparément optionnels. Commentaires/attachments d'annotations aplaties perdent
  leurs données interactives. AES-256, mot de passe d'ouverture/propriétaire,
  permissions impression/modification (ignorables par certains lecteurs),
  confirmations et secrets éphémères. PDF chiffré non rouvert automatiquement.
- **Signature numérique** : non livrée. Sous-ticket
  [SIGNATURE_NUMERIQUE_004.md](SIGNATURE_NUMERIQUE_004.md) avec audit initial
  pyHanko et preuves crypto/packaging requises. Aucune dépendance ajoutée.
- **Présentation** : slide courante conservée, rendu secondaire complet avant
  swap, annulation et rejet des résultats obsolètes, erreur non destructive,
  maintien du canvas pendant resize/fullscreen. Aucune précharge non bornée.

## Architecture

- `PdfEdit[]` est la source de vérité des plans ; `order` dérive de l'index.
  Le PDF original est la couche de base. Chaque objet ajouté possède un contexte
  CSS correspondant à cet ordre ; poignées/inspecteurs ne sont jamais exportés.
- Images référencées par ID SHA-256, données dans le registre partagé avec les
  signatures et un store IndexedDB `images`. Pas de dataURL dans chaque edit ni
  de copie par entrée d'historique. Le même fichier inséré dix fois donne un asset.
- IndexedDB v2 ajoute les assets et edits complets sans supprimer les anciennes
  colonnes ; écriture documents/assets transactionnelle, pruning des assets.
  Mémoire fallback préservée ; historique limité aux 100 snapshots de session.
  Les références d'images du clipboard et de l'historique restent vivantes tant
  qu'elles peuvent être réutilisées. Aucune URL objet ajoutée pour ces images.
- Payload `schemaVersion: 2`, validation Pydantic, composition triée, options
  MuPDF, réouverture/validation du PDF final, temporaire fermé/synchronisé avant
  destination atomique. Copie `data/output` sans écrasement et nettoyage sur erreur.
  Les commandes Rust existantes gardent leurs écritures atomiques et IDs opaques.
- Save réussi marque seulement l'état réellement exporté : des edits, même
  coalescés, ou changements de pages intervenus pendant l'opération restent dirty.
  Une sauvegarde conserve l'historique. Le drag produit un commit à la relâche.
- Rendu PDF.js dans un canvas détaché ; copie synchrone de la frame complète vers
  le canvas visible, puis commit de page. Front/incoming au maximum deux pages,
  staging libéré et render tasks annulées ; aucun stockage de vingt slides haute
  résolution. Callback stable vérifiant la dernière cible avant swap.

## Compatibilité

- Edits historiques sans plans : ordre du tableau existant. Rectangles/ellipses,
  lignes sans endpoints/lineStyle et signatures graphiques gardent leurs defaults.
- Documents IndexedDB v1 : upgrade additif ; fallback aux anciens edits texte
  natif/formulaires lorsque les edits complets sont absents. Destinations natives
  jamais restaurées. Tests de persistance et de fallback, reload navigateur exécuté.
- Payloads backend historiques sans version/options : defaults v1 et politique
  d'export antérieure. Images/styles nouveaux optionnels. Fixtures source anciennes
  utilisées dans les régressions, sans modification des binaires historiques.
- Formulaires, annotations, commentaires et text markup : suites unitaires/backend
  complètes et parcours forms/text markup/signature/save existants. Le rendu de
  sélection privilégie la couche supérieure ; l'inspecteur permet l'objet inférieur.

## Tests WSL

| Contrôle | Résultat final |
| --- | --- |
| Frontend complet `npm run test:run -- --maxWorkers=2` | 59 fichiers, 317 tests réussis |
| Backend complet pytest | 294 réussis, 3 ignorés |
| Backend ciblé export | 51 réussis, 1 ignoré |
| Ruff moteur et script de mesures | Réussi |
| Lint (`tsc --noEmit`) | Réussi |
| Typecheck E2E | Réussi |
| Build web | Réussi (avertissement chunk JS > 500 ko, environ 901 ko) |
| Playwright Chromium + Firefox | 30 réussis, 0 retry, 0 ignoré, 141.84 s |
| Desktop statique `--skip-cargo` | Réussi : configuration/capabilities, build web, 3 tests Python ; Cargo/Rust/Tauri ignorés |
| `git diff --check` | Réussi avant commits |

La dernière campagne E2E débute à 09:23:09 UTC sur le code final.
Sept nouveaux parcours et huit existants par navigateur. Aucune erreur
console/réseau inattendue collectée. Artefacts JSON/PDF/captures sous
`apps/web/test-results/`, ignorés et
non ajoutés aux commits. `QA_AUTOMATED_REPORT.md` n'est pas utilisé comme preuve
de ce run direct ; le JSON et ce rapport daté décrivent l'exécution.

Backend : trois skips — fixtures privées absentes et lecteur pypdf AES sans sa
dépendance optionnelle cryptography. **qpdf indépendant** valide et déchiffre la
sortie AES ; PyMuPDF vérifie auth/permissions/contenu. Un échec LibreOffice dans
la sandbox a été résolu par une exécution hors sandbox ; la suite complète finale
est verte. Les avertissements SWIG sont présents, sans échec.

Les assertions couvrent images réouvertes/bbox/ratio, alpha et pixels superposés,
compression et masque PNG, texte sélectionnable, formulaires aplatis apparence
identique, annotations conservées par défaut, secrets masqués et erreurs génériques,
flèches horizontales/verticales/diagonales/courtes et validation 1:1, nettoyage du
temporaire après erreur. Frontend : Save As IPC simulé, annulation/erreur/destination
suivante, historique/plans, endpoints, resize contraint, EXIF, stockage partagé,
focus et sécurité du dialogue, résultats de rendu obsolètes/erreurs.

## QA navigateur et performance

Campagne pilotée Playwright, inspection de capture DPR 2 effectuée : aucune
anomalie reproductible restante constatée sur les parcours ciblés. Zooms 50/100/
150/200 %, thèmes clair/sombre, Continu/Page unique/Présentation, portrait/paysage,
vingt pages, superpositions et régressions de sauvegarde. Composition
multi-document couverte côté backend.
Aucune session manuelle exhaustive avec PDF lourd personnel, imprimante ou
clavier physique ; aucun document personnel consulté.

Mesures indicatives du run du ticket (les suites unitaires tournaient aussi) :

| Opération | Chromium | Firefox |
| --- | ---: | ---: |
| Insérer une image | 46.90 ms | 25.79 ms |
| Insérer dix images | 930.97 ms | 380.79 ms |
| Vingt changements de plans | 2128.80 ms | 1619.68 ms |
| Export dix images maximum | 386.77 ms | 300.41 ms |
| Export dix images équilibré | 384.90 ms | 357.07 ms |
| Export dix images petite taille | 369.73 ms | 360.74 ms |
| Navigation vingt slides | 2758.55 ms | 1369.75 ms |
| Frames échantillonnées | 60 | 64 |
| Canvas vide / pixel témoin blanc ou noir | 0 / 0 | 0 / 0 |
| Canvases de pages montés maximum | 2 | 2 |

Le sampling vérifie le pixel central des slides synthétiques colorées et le canvas
visible ; ce n'est pas une preuve exhaustive de chaque pixel/chaque frame sur
toutes les machines. Vitest impose en plus un rendu différé et vérifie l'absence
de swap anticipé, de canvas effacé et de commit obsolète. DPR 2, resize, entrée/
sortie fullscreen, navigation rapide et Escape exécutés dans les deux moteurs.

Chromium heap JS mesuré avant/après dix images : 14.3 Mo / 14.3 Mo, valeur
quantifiée indicative ; Firefox ne fournit pas de mesure comparable. Un asset
IndexedDB pour dix occurrences. Ceci ne mesure ni mémoire totale ni mémoire GPU,
et ne prouve pas une absence de fuite sur une longue session.

Mesures backend via `scripts/measure-editor-export.py`, Python 3.11.2 / MuPDF
1.26.3. Quatre fixtures entièrement synthétiques ; pic RSS processus :
165 052 Kio (environ 161 Mio). Sorties dans `data/output/editor-export-003`, ignorées.

| Fixture (source octets) | Maximum : octets / ms | Équilibré : octets / ms | Petite taille : octets / ms |
| --- | ---: | ---: | ---: |
| Texte/vectoriel (895) | 907 / 2.17 | 794 / 2.15 | 794 / 2.76 |
| Image-heavy (4 323 513) | 4 324 665 / 108.61 | 368 517 / 63.00 | 26 225 / 15.50 |
| Mixte (4 323 944) | 4 325 008 / 103.68 | 368 660 / 70.00 | 26 368 / 16.55 |
| Dix images ajoutées (895 avant edits) | 4 326 059 / 191.67 | 442 071 / 255.94 | 29 450 / 182.42 |

Largeur image contrôlée : 1200 / 600 / 300 pixels suivant le profil.
Une source déjà optimisée peut augmenter ; aucune promesse chiffrée universelle.
Les quatre nouveaux binaires editor-* ont été régénérés : SHA-256 identiques.
Les temporaires d'export sont nettoyés sur réussite/erreur ; historique et nombre
de canvases bornés. Les documents exportés volontairement ouverts dans de nouveaux
onglets consomment de la mémoire jusqu'à leur fermeture, comme auparavant.

## Validation Windows native

**NON RÉALISÉE / À REQUALIFIER.** Aucune release Windows qualifiée par ce ticket.
Aucune validation WSL/browser n'est une preuve de dialogue natif, WebView2,
installateur, impression, HiDPI/multi-écran réels ou sidecar Windows packagé.
Les modifications frontend/backend peuvent rendre obsolètes les conclusions
antérieures ; les rapports Windows historiques sont conservés sans retouche.

Campagne suivante obligatoire après stabilisation :

- Save As premier/suivant/explicite, annulation/overwrite choisi explicitement,
  Unicode, Bureau/Documents, lecture seule/verrouillage, chemin long, OneDrive/SMB.
- PNG/JPEG natifs et accents/espaces, export/réouverture/relance.
- Plans/transparence, souris réelle, carré/cercle/flèche sous WebView2 et plusieurs DPI.
- Profils, tailles/validité, flatten et mots de passe/permissions.
- Présentation sans flash, clavier/navigation rapide, fullscreen/resize,
  DPI 100–200 %, petits écrans/1080p/4K et multi-écran disponible.
- VM propre NSIS, outils de développement absents, upgrade/désinstallation,
  sidecar et WebView2. MSI/association et signature/notarisation restent les
  gates de release documentés historiquement.

## Documentation et Git

Documents modifiés : README.md, DESKTOP.md, QA_AUTOMATION.md, TECHNICAL_DEBT.md.
Rapport ajouté : ce fichier. Sous-ticket ajouté : SIGNATURE_NUMERIQUE_004.md.
Scripts : génération de fixtures synthétiques et mesure des profils.

Commits d'implémentation locaux :

- `64f250b feat(export): compose images and add secure finalization profiles`
- `5a032ce feat(editor): add safe saves, image layers and buffered presentation`

Le commit documentaire suivant est listé dans le rapport final et `git log`.
Le seul changement local préexistant doit rester `.gitignore`.
Aucun artefact QA généré automatiquement ajouté ; seuls les nouveaux petits
binaires synthétiques reproductibles sont versionnés. Aucun amendement.

**Validation WSL : suites frontend/backend et E2E navigateur ciblées.**
**Validation Windows native : NON RÉALISÉE / À REQUALIFIER.**
**Push : non effectué.**
