# Documents image et PDF multipage

PNG, JPEG et WebP statiques s’ouvrent comme sources distinctes, y compris si le
MIME ou l’extension d’une image ne correspond pas au contenu. L’onglet garde
le nom et le format d’origine. IndexedDB conserve les octets originaux, les
annotations et la liste ordonnée des transformations. Le PDF de travail est
régénéré en mémoire par le moteur local. Cette architecture réutilise PDF.js,
les coordonnées PDF, la navigation et le pipeline d’export. La restauration
d’une image requiert donc le moteur local.

Le backend PyMuPDF 1.26.3 conserve le flux JPEG et applique son EXIF, y compris
les orientations miroir. Le PNG alpha garde son masque sur le fond PDF choisi.
Pour WebP, le navigateur normalise l’image en PNG avant de l’envoyer au moteur
local. Les WebP animés, les WebP portant un bloc EXIF et les PNG animés sont
refusés avec un message. La gestion colorimétrique professionnelle des profils
ICC reste à qualifier.

Le fond d’une page image accepte rotation par 90°, miroirs et recadrage visuel.
L’aperçu du cadrage propose des poignées et les cadres initiaux Libre, Carré et
Photo (4:3). Le fond transformé est ajusté dans le format de page initial.
Les annotations gardent leurs positions en points PDF. L’historique de session
couvre transformations, réinitialisation et annotations. Le dernier état est
restauré au rechargement. Les piles undo/redo sont propres à la session.
Le recadrage visuel laisse les pixels hors cadre récupérables. Les sources
image désactivent le biffage sécurisé et l’édition de texte natif. La rotation
libre, les filtres et la retouche des pixels restent hors périmètre.

**Nouveau PDF à partir d’images** permet de réordonner les miniatures au clavier
ou par glisser-déposer. Les mises en page A4, Lettre et Taille de l’image
proposent orientation automatique ou imposée, marges en points, fond et
ajustement avec ou sans agrandissement. Le mode Taille de l’image utilise une
base constante de 96 dpi et autorise des pages de tailles différentes. Le PDF
généré s’ouvre dans un nouvel onglet. Les originaux restent intacts.

Chaque fichier est limité à 32 Mio, 40 millions de pixels et 20 000 pixels par
axe. Une conversion accepte jusqu’à 250 sources, 192 Mio après normalisation et
128 millions de pixels au total. Le budget des onglets image est de 192 Mio
pour les originaux ou 512 Mio estimés en RGBA. Les anciens seuils PDF de 50 Mo,
250 pages et huit documents restent des seuils d’avertissement. L’annulation
interrompt la demande côté interface et ignore un résultat tardif. Un calcul
déjà démarré dans le moteur local peut se terminer en arrière-plan.

## Validation

Les images utilisées par les tests sont synthétiques. Les PDF produits restent
dans les répertoires temporaires de QA. Les tests backend vérifient les huit
orientations EXIF par lecture des pixels, l’alpha et la couleur de fond, le
ratio avec métadonnées DPI asymétriques, le JPEG intégré, les formats de page,
l’ordre, la géométrie des transformations et le rejet des entrées invalides.

La campagne web utilise PDF.js 6.2.108 et les navigateurs verrouillés par
Playwright 1.62.0. Le build, le lint, le contrôle des types E2E et les
396 tests Vitest passent. Les 18 scénarios Chromium et Firefox passent après les
derniers changements, dont 6 dédiés aux images. Les autres testent l’ouverture
de PDF valides ou corrompus, la composition, les tampons et le biffage PDF.
La campagne complète Playwright et les scénarios marqués `@slow` n’ont pas
été exécutés. Les commandes suivantes se lancent depuis `apps/web` avec
les navigateurs installés et leurs dépendances système disponibles.

```bash
npm run lint
npm run typecheck:e2e
npm run build
npm run test:run -- --maxWorkers=1 --testTimeout=15000
npm exec -- playwright test image-documents.spec.ts pdf-opening.spec.ts export.spec.ts redaction-stamps.spec.ts --grep-invert @slow --timeout 120000
```

Depuis `services/pdf-engine`, Ruff et les 83 tests ciblés passent, dont
33 propres aux documents image.

```bash
uv run ruff check .
uv run pytest tests/test_image_documents.py tests/test_clean_integration.py tests/test_global_composition.py tests/test_redaction_search.py tests/test_forms.py tests/test_desktop_server.py -q
```

La suite backend complète, lancée avant les dernières corrections de cadrage,
a donné 465 succès, 33 ignorés et 4 échecs de conversion OCR dus à l’absence de
Tesseract. Le contrôle Desktop a validé la configuration, le build web et les
trois tests du serveur local. Cargo est absent du conteneur. Le dialogue natif,
le glisser-déposer Windows et la WebView distribuée restent à qualifier sur
Desktop. La QA manuelle sur des photos réelles et l’impression n’ont pas été
rejouées.


## Correction du rectangle blanc

Sur PDF.js 6.2.108, un PNG synthétique RGBA de 640 × 400 à quatre aplats
ouvrait un document et une miniature entièrement blancs. Le PNG décodé avait
les bonnes dimensions et PyMuPDF rendait les quatre couleurs dans le PDF
temporaire de 480 × 300 pt. Le flux du masque alpha binaire était compressé
en `CCITTFaxDecode` à la sauvegarde par MuPDF. PDF.js signalait
`JBig2 failed to initialize` dans le build sans les fichiers du décodeur.
L’export de la source image encode désormais les bits du masque en Flate.
Les PNG partiellement transparents gardent le même rendu sur le fond prévu.

Un panorama synthétique de 20 000 × 120 à DPR 5 révélait aussi un canvas à
75 000 × 450 marqué prêt, dont les pixels restaient transparents. Le viewer
plafonne chaque tampon à 8 192 pixels par axe et 16 777 216 pixels au total. Le
zoom, les dimensions CSS et les coordonnées des annotations gardent leur
géométrie. Une erreur de rendu image affiche le nom du fichier.

L’insertion d’une image sur une page PDF garde sa couche HTML, sa géométrie
et son modèle d’édition. Son export produisait le même masque illisible
pour le PNG de contrôle malgré un aperçu HTML correct. L’export réutilise
donc le même encodage Flate pour ces masques. Le nouveau scénario
Playwright vérifie les couleurs de l’aperçu et du PDF rouvert. Les fixtures couleur sont générées dans le
test et ne proviennent d’aucun document personnel.

La campagne après la dernière modification compte 20 scénarios réussis sur
Chromium et Firefox. Elle mesure les pixels des PNG, JPEG et WebP, y compris
après zoom, ajustement, redimensionnement, changement d’onglet et restauration.
Elle vérifie aussi les deux parcours d’export et le rejet des fichiers
corrompus. Les 398 tests Vitest, le lint TypeScript, le typage E2E et le build
passent. La sélection pytest ci-dessous donne 95 succès et 2 tests ignorés.
Ruff passe. Les parcours sont qualifiés dans les navigateurs headless. Tauri
et la QA manuelle interactive restent non exécutés.

```bash
# apps/web
npm run lint
npm run typecheck:e2e
npm run build
npm run test:run -- --maxWorkers=1 --testTimeout=20000
npm exec -- playwright test image-open-render.spec.ts image-documents.spec.ts pdf-opening.spec.ts --grep-invert @slow --timeout 120000

# services/pdf-engine
uv run ruff check .
uv run pytest tests/test_image_documents.py tests/test_clean_integration.py tests/test_editor_export_profiles.py -q
```
