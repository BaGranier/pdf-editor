# WINDOWS-CLEAN-INTEGRATION-FIXES-004

Campagne du 8 octobre 2026, Windows natif, branche `main`, baseline
`1e0ef01`. Worktree initial propre. Aucun PDF personnel utilisé, aucun push.
Les fixtures volumineuses, installateurs, captures et JSON restent ignorés dans
`data/output/windows-qa-004`, `apps/web/test-results` et les dossiers de build.

## Portée et statuts

`OK` : exécuté et conforme ; `KO` : échec fonctionnel ; `R` : régression ;
`NT` : non testé ; `ENV` : empêché par environnement ; `AUTO` : preuve
automatique sans parcours natif équivalent ; `PARTIAL` : preuve partielle.

**La VM Hyper-V clean est inaccessible depuis cette session**, confirmé par
l'utilisateur. Aucune dépendance n'y a été installée, aucun écran n'y a été
mesuré. Le smoke clean et la qualification native 1080×1900 sont `ENV`.
Le succès sur le poste de développement avec PATH isolé ne les remplace pas.

## Environnement réellement mesuré

| Mesure | Poste de développement installé | VM clean de référence |
| --- | --- | --- |
| OS | Windows 11 Professionnel, 10.0.26200, x64 | ENV : build exact inconnu |
| Virtualisation | Microsoft Virtual Machine, adaptateur vidéo Hyper-V | Hyper-V annoncé, ressources non mesurées |
| CPU/RAM | i7-13700K exposé, 12 processeurs logiques ; 5 118 868 KiB RAM | ENV |
| Écran | DISPLAY1, 1920×1080 ; dmDisplayOrientation=0 via EnumDisplaySettings | 1080×1900 demandé ; orientation réelle ENV |
| Work area | (0,0)–(1920,1032), 48 px réservés en bas | ENV, barre des tâches non relevée |
| DPI | 96 DPI, scale factor Tauri 1, DPR WebView2 1 | ENV |
| Fenêtre initiale | outer 1296×859, inner 1280×820, position (312,86), non maximisée | ENV |
| Canvas initial | CSS 612×792, backing store 612×792 | ENV |
| WebView2 | 154.0.4258.62 | ENV |
| Outils dev | Node 24.19.0 (build avec Node 22 local), Python 3.11.9, uv, Rust/MSVC/SDK | Présence exacte ENV |
| OCR externe | Tesseract/Ghostscript/QPDF présents sur le poste ; exclus du PATH de l'application QA | Tesseract absent selon le signalement utilisateur ; pas de nouveau relevé |

Preuves : `environment.json` et `{final,release,current}/window-metrics/*.json`.
Les dialogues sont les vrais dialogues Windows français, pilotés par le helper
UI natif. Aucune API générale shell/filesystem n'est ajoutée au frontend.

## Inspection et corrections Windows

Le sidecar est un exécutable PyInstaller onefile, lancé par le plugin shell
Tauri. Ses événements stdout/stderr alimentent les logs persistants ; health,
retry, kill tree et Job Object sont conservés. Le build historique du **shell**
avait un PE subsystem 3 (console). `src/main.rs` déclare désormais le subsystem
GUI en release ; le PE produit a le subsystem 2. Le sidecar garde ses pipes,
sans passer à `--noconsole`. Les sous-processus Python utilisent
`CREATE_NO_WINDOW` ; leur annulation Windows termine l'arbre avec taskkill.

Les relevés EnumWindows avant/après lancement normal contiennent uniquement
le terminal déjà présent, sans nouvelle console visible. Un `conhost` caché
peut exister : il n'est pas une fenêtre utilisateur restante. Le lancement
par argument PDF, l'OCR et les crash/retry ont été exécutés.
Raccourci/menu Démarrer/double-clic associé restent `NT` pour cette campagne.

Le NSIS final pèse **53 711 431 octets** ; installation **63 022 813 octets**,
MSI généré **54 837 248 octets**. SHA-256 NSIS :
`b06fefb0a6f0aedaa1a5b05a6c6b02bf4d1911880897dbd5dfa9f35b41bddf40`.
La baseline NSIS 002 était de 46 695 504 octets : +7 015 927 octets,
comparaison de campagnes incluant runtime/notices et autres évolutions, sans
prétendre à une mesure A/B exclusivement OCR. Les langues sont dans le onefile ;
les notices sont des ressources d'installation. NSIS install/uninstall : codes
retour 0, exécutables présents puis supprimés. WebView2 bootstrapper reste celui
du dépôt ; absent/offline NT. MSI installation reste NT/ENV, sans succès inventé.

Les répertoires `backend-<pid>` de plus de 24 h sont nettoyés au démarrage
uniquement après preuve d'absence du PID, acquisition exclusive de la lease,
contrôle du périmètre canonique et refus des reparse points. Un processus actif,
une lease verrouillée, un dossier récent, un dossier étranger ou un ancien dossier
sans lease sont conservés. Les tests natifs Rust couvrent ces exclusions.

Le contrôle `/health` du script de build a révélé un verrou Windows transitoire
sur la nouvelle lease après arrêt du bootloader PyInstaller. Il attend désormais
le worker par handle, sans ambiguïté de PID recyclé, puis retente le nettoyage
borné. Il échoue si le worker ou le verrou persistent ; l'erreur n'est pas ignorée.

La dernière vérification a corrigé l'interprétation ANSI du helper PowerShell 5 :
le chemin `installation été QA` est désormais construit avec les caractères
Unicode explicites. Une nouvelle installation, la notice PyInstaller vérifiée
par hash et un OCR eng ont été exécutés sous ce chemin exact (`unicode-final`).

## Runtime OCR et licences

Le prototype avec `PATH` vide a confirmé que le wheel **PyMuPDF 1.26.3** possède
déjà le moteur MuPDF/Tesseract. La stratégie retenue ajoute les données de langue
et un worker isolé dans le même exécutable gelé, sans nouvelle dépendance majeure.

`sys._MEIPASS/ocr` résout le runtime à chaque lancement, y compris sous un chemin
avec espaces/accents. Le manifest et les langues sont vérifiés par SHA-256.
Le runtime gelé ne consulte ni PATH, ni `C:\Program Files\Tesseract-OCR`, ni
Python utilisateur, ni `TESSDATA_PREFIX`. Le développement non gelé conserve
OCRmyPDF, ou choisit explicitement `PDF_ENGINE_OCR_RUNTIME` pour la QA intégrée.
Les variables système utilisateur ne sont pas modifiées.

Le worker traite à 200 DPI, RGB, avec 40 millions de pixels maximum par page
avant allocation. Force OCR rasterise la page puis ajoute le texte ; skip-text
conserve les pages déjà numériques. Les rotations PDF orthogonales sont retirées
pendant la reconnaissance et rétablies dans le résultat. Le redressement des scans
inclinés et l'orientation automatique des pixels ne sont pas implémentés ; la
case deskew desktop est désactivée avec explication. `osd` est fourni, sans
promesse de correction automatique.

Les scans identiques conservent des objets `/Page` distincts (`garbage=2`) :
`garbage=4` provoquait un échec pypdf strict par références de pages répétées.
La régression couvre cinq scans identiques dont un `/Rotate=90`.

| Composant redistribué | Version exacte/source | Licence et obligations |
| --- | --- | --- |
| Python | 3.11.9, runtime PyInstaller | PSF ; notice Python incluse |
| Bootloader PyInstaller | 6.16.0 | GPL-2.0-or-later avec exception bootloader ; hooks runtime Apache-2.0, COPYING complet fourni |
| PyMuPDF/MuPDF | 1.26.3, wheel Windows verrouillé dans uv.lock | AGPL-3.0 ou licence commerciale Artifex ; conserver notices et respecter les obligations de source/licence choisie |
| Tesseract intégré à MuPDF | fork Artifex `a3a7bfaba8b1b575142f9752dba7540ac204f437` ; header MuPDF annonce 5.0.0-alpha | Apache-2.0 ; licence/attributions incluses |
| Leptonica intégré | fork Artifex `0dc051249fa596016310e6d1509518fd34be4f63` | BSD-2-Clause ; copyright, conditions et disclaimer inclus |
| tessdata_fast eng/fra/osd | révision `87416418657359cb625c412a48b6e1d6d41c29bd` | Apache-2.0 ; LICENSE fourni |

Sources primaires : [API OCR MuPDF](https://pymupdf.readthedocs.io/en/latest/recipes-ocr.html),
[licence PyMuPDF](https://pymupdf.readthedocs.io/en/latest/about.html#license-and-copyright),
[licence/exception PyInstaller 6.16](https://github.com/pyinstaller/pyinstaller/blob/v6.16.0/COPYING.txt),
[source MuPDF 1.26.3](https://github.com/ArtifexSoftware/mupdf/tree/1.26.3),
[Tesseract du fork](https://github.com/ArtifexSoftware/thirdparty-tesseract/tree/a3a7bfaba8b1b575142f9752dba7540ac204f437),
[Leptonica du fork](https://github.com/ArtifexSoftware/thirdparty-leptonica/tree/0dc051249fa596016310e6d1509518fd34be4f63),
[tessdata_fast verrouillé](https://github.com/tesseract-ocr/tessdata_fast/tree/87416418657359cb625c412a48b6e1d6d41c29bd).

`audit-ocr-licenses.py` contrôle les notices amont par SHA-256 et copie les
notices fournies par les distributions Python sous `licenses/ocr`. L'inventaire
`python-environment.json` décrit l'environnement de build, pas une affirmation
que chaque package de développement est redistribué. Les codecs PDF/image
existants restent ceux du wheel MuPDF, sans plugin OCR/exécutable supplémentaire.
Une revue exhaustive des licences transitives de toute l'application demeure
nécessaire avant publication.

**Décision de distribution restante** : aucune licence commerciale Artifex ni
politique de distribution du projet n'est établie dans le dépôt. La diffusion
propriétaire ne peut pas être déclarée autorisée par cette campagne. Le fait de
ne pas embarquer Ghostscript ne supprime pas les obligations AGPL de MuPDF.

OCRmyPDF, Ghostscript, pikepdf/libqpdf et QPDF CLI ne participent pas au parcours
gelé retenu et ne sont pas ajoutés au package. Ghostscript reste une dépendance
du parcours OCRmyPDF historique ; QPDF CLI est utilisé uniquement en QA.

Les données eng/fra/osd totalisent **15 806 180 octets** avant compression :
eng 4 113 088, fra 1 130 365, osd 10 562 727. Hashes et sources exacts sont dans
`prepare-ocr-resources.py` et le manifest généré, sans gros binaires versionnés.

## Modèle et rendu des images/plans

L'ordre de `PdfEdit[]` reste la source de vérité ; le payload en dérive `order`.
Markup et commentaires locaux rejoignent les wrappers ordonnés des images,
formes, traits, dessins et textes. Aucun z-index spécial highlight n'est ajouté.
Le blend multiply indépendant du plan est supprimé ; l'alpha réel compose les
objets. La liste des objets permet toujours de sélectionner un objet couvert.

Au backend, les markups locaux sont des vecteurs dans le flux ordonné plutôt
que des annotations PDF peintes après tout le contenu. Les commentaires locaux
ont une apparence vectorielle ordonnée et conservent leur contenu dans une
annotation cachée. À la réouverture, le sidebar garde cette metadata sans
repeindre le marqueur caché ; une affordance peut apparaître pendant sélection.
Les annotations préexistantes dans le PDF source restent dans leur couche PDF
historique et ne deviennent pas des objets locaux réordonnables.

Le crop normalisé `{x,y,width,height}` est non destructif, dans l'espace source
de l'image. Le cadre déplaçable/redimensionnable a huit poignées, validation,
annulation/Escape, focus et reset. Un geste validé crée une seule action
d'historique, sans réencoder l'asset à chaque mouvement. L'export découpe
uniquement le bitmap conservé avec PyMuPDF ; la page n'est pas rasterisée.
Le resize image est libre sur largeur/hauteur/diagonale ; Shift ou le toggle
conserve le ratio. Les signatures, carrés et cercles gardent leurs contraintes.

Defaults rétrocompatibles : crop absent=image entière, aspect-lock absent=ratio
historique, order absent=tri stable historique. IndexedDB reste v2 ; les anciens
records v1/v2 sans crop sont couverts. Les documents ouverts via identifiant
Tauri restent volontairement session-only : la destination native n'est pas
persistée. La persistance des assets/crops et sa migration sont qualifiées sur
le parcours web restaurable, sans contourner cette frontière desktop.

Le seuil apparent 1 Mo venait du champ multipart contenant les images base64
(Starlette 0.41). Les nouveaux exports envoient des parties binaires `imageFiles`
avec `imageIds`, et un plan contenant uniquement les métadonnées. Le petit
payload historique dataURL reste accepté. Les assets uniques sont dédupliqués.

Garde-fous : 40 Mpx/image, 20 000 px/axe, vérification PNG/JPEG avant décodage,
dimensions déclarées concordantes, 128 assets/export. La limite compressée
32 Mio correspond à un budget de copies transitoires de 128 Mio ; le cumul
est 192 Mio compressés et 512 Mio RGBA estimés, côté frontend et backend.
Ce sont des budgets d'allocation, pas une promesse sur la RAM totale/GPU.
Les originaux raisonnables ne sont pas systématiquement sous-échantillonnés.

## Résultats d'intégration

| Parcours | Statut | Preuve/limite |
| --- | --- | --- |
| NSIS installé dans `installation été QA` | OK poste dev | silent install réel, PATH enfant limité à Windows |
| Aucune nouvelle console visible | OK poste dev | EnumWindows avant/après, PE GUI ; menus/raccourcis NT |
| Ctrl+S initial / annulation / Save As Unicode `.PDF` / Save suivant / overwrite Oui | OK natif | vrais dialogues, dirty, destination copie ; source synthétique inchangée |
| Erreur écriture/lecture seule | AUTO | tests Rust/frontend ; overwrite Non/dialogue NT cette campagne |
| PNG/JPEG >1 Mo, dont PNG 10,84 Mo et JPEG 7,34 Mo | AUTO + OK natif 5,47 Mo | E2E/ASGI réouvrent les exports, native crop/resize et dix imports |
| Crop/reset/undo/redo/reload | AUTO + PARTIAL natif | natif crop/history ; reset/reload web restaurable |
| Quatre commandes de plans, highlight masqué | OK natif + AUTO | screenshot WebView2, ordre modèle, tests PDF pixels opaque/alpha |
| Image/ellipse/cercle/flèche/freehand avec markup | AUTO | exports inspectés, pixels et vecteurs ; texte reste sélectionnable |
| Carré/cercle/flèche | OK natif + AUTO | ratio 1:1, pointe, undo/redo, export vectoriel |
| Compression maximum/équilibré/réduit | OK natif + AUTO | fichiers PDF inspectés et réouverts ; bruit synthétique, pas corpus photo réel |
| AES-256/permissions/mot de passe | OK natif + AUTO | mauvais mot de passe rejeté, bon accepté par MuPDF ; sortie non rouverte et message explicite |
| Aplatissement | AUTO + PARTIAL natif | options natives exécutées ; fixtures AcroForm/annotations vérifiées au backend |
| Présentation fullscreen, 20 slides/navigation rapide/Home/End/PageDown/Escape | OK natif + AUTO | 49 frames, zéro empty/transparent/monochrome, deux canvases maximum |
| OCR eng/fra | OK installation PATH isolé | témoins sélectionnables/recherchables, accents français ; clean ENV |
| OCR multipage + rotation PDF | OK après correctif | cinq pages distinctes pypdf strict ; orientation des pixels/deskew NT/non pris en charge |
| Ressource eng corrompue, fra absente | OK natif | 503/422 et message UI contrôlé ; copie QA restaurée ; original conservé |
| Binaire OCR corrompu | NT natif | résolution/missing runtime AUTO ; pas de corruption d'exécutable utilisateur |
| Deux crashs worker/deux retries | OK natif | session/dirty conservés, ports renouvelés |
| Crash shell/Job Object | OK natif | descendants et ports suivis terminés |
| Cinq fermetures normales finales | OK natif | zéro descendant et zéro port à chaque cycle |
| Fermeture pendant OCR / OCR après relance | OK natif | trois processus moteur observés pendant OCR ; arbre terminé, nouvel OCR eng réussi |
| NSIS désinstallation | OK poste dev | exit code 0, executableRemaining=false ; clean ENV |
| Nettoyage dossiers stale | AUTO natif Rust + OK installation | dossier QA âgé de deux jours, PID absent, lease et périmètre sûr ; exclusions couvertes en Rust |
| MSI | build OK, installation NT/ENV | pas de nouvelle tentative d'installation administrateur |
| VM clean / désinstallation clean / 1080×1900 natif | ENV | aucun accès, métriques et contrôles non inventés |
| 1080×1900 navigateur | AUTO | viewport, crop/poignées/actions accessibles dans Chromium et Firefox |

## Compression et performance

Les dix imports PNG 5 470 604 octets partagent **un seul asset** dans le plan
exporté. Un crop distinct produit un bitmap distinct à l'export. Sur le PDF
numérique de deux pages, première série dans le dossier racine QA :
maximum 9 974 193 octets, équilibré 4 722 971,
réduit 517 411. Les trois sorties gardent 110 caractères natifs extractibles.
Les crops/permutations vectorielles sont aussi inspectés au backend.
Inspection visuelle du maximum, équilibré, réduit et du highlight couvert
réalisée. Le profil réduit moyenne fortement le bruit synthétique, sans altérer
le texte natif ; un corpus photo/scan réel reste à comparer. Un gain de taille
ne prouve pas une qualité photo suffisante.

Les snapshots comprennent shell, WebView2, sidecar et conhost ; les working sets
additionnés comptent des pages partagées plusieurs fois. Private bytes, handles,
CPU et nombre de processus sont conservés dans les JSON. Les valeurs ne fixent
aucun seuil bloquant sans baseline. Dix imports, plans répétés, resize/crop,
undo/redo et trois exports ont été exécutés. Les sessions sont rouvertes et
fermées ; un stress prolongé avec 20 assets distincts et plusieurs cycles reste
`NT`. Le budget évite une croissance sans limite d'assets acceptés, mais ne
constitue pas une preuve d'absence de fuite GPU/heap. Les URLs objet et canvases
utilisent les mécanismes de libération existants ; aucun asset crop par mouvement.

| Snapshot | Working set groupe Mio | Private bytes Mio | Processus | Handles | CPU cumulé s |
| --- | --- | --- | --- | --- | --- |
| Idle sans document | 478,8 | 246,1 | 10 | voir JSON | voir JSON |
| Petit PDF, session QA existante | 505,2 | 309,5 | 10 | 3 809 | 11,63 |
| Après crop image 5,47 Mo | 632,1 | 423,0 | 10 | 3 813 | 12,83 |
| Dix instances, un asset | 672,9 | 449,8 | 10 | 3 815 | 19,89 |
| Après trois exports ouverts | 990,2 | 825,2 | 10 | 3 901 | 35,39 |
| Après OCR eng, première session isolée | 681,1 | 374,5 | 10 | 3 415 | 2,41 |

Les sessions/dates diffèrent : ce tableau ne soustrait pas arbitrairement les
snapshots pour annoncer une fuite ou un gain. Le pic OCR n'est pas mesuré.
La fermeture normale et le crash shell donnent zéro descendant suivi et
zéro port restant. Les assets de l'historique peuvent rester en mémoire pendant
la session ; le pruning existant tient compte de undo/redo et du presse-papiers.
Son effet après fermeture documentaire nécessite encore une mesure plus longue.

## Tests et artefacts

| Contrôle final | Résultat |
| --- | --- |
| Frontend Vitest | 332 réussis, 62 fichiers |
| lint TypeScript / typecheck E2E / build web | OK ; warning Vite taille bundle existant |
| Backend pytest | 317 réussis, 8 skips explicités ci-dessous |
| Ruff backend et scripts ajoutés | OK |
| Rust stable Windows | 10 tests OK |
| Rust MSRV 1.88.0 Windows | 10 tests OK |
| desktop:check | OK natif |
| desktop:build NSIS/MSI | OK, build réel avec sidecar et notices |
| Chromium/Firefox | 38 scénarios OK après dernier changement frontend |
| WebView2 native | OK/PARTIAL selon matrice ci-dessus |
| Smoke clean | ENV |

Skips : quatre validations visuelles DOCX requièrent LibreOffice, deux fixtures
privées ne sont pas autorisées, un parcours OCRmyPDF historique requiert ses
outils, et une vérification AES pypdf requiert un module crypto optionnel absent.
L'AES est néanmoins vérifié avec PyMuPDF sur une sortie native, sans nouvelle
dépendance ajoutée. Les avertissements SWIG ne sont pas des échecs.

Scripts réutilisables : `windows-clean-qa.ps1`, `windows-qa-cdp.cjs`,
`windows-qa-processes.ps1`, `windows-qa-environment.ps1`,
`generate-clean-integration-fixtures.py`. Les rapports `final` couvrent
images/sauvegarde/erreurs OCR ; `release` couvre plans/AES/présentation/retry ;
`current` couvre la dernière rotation OCR. Les erreurs de campagnes intermédiaires
ont été corrigées et ne sont pas effacées des artefacts ignorés.

## Clôture et dette

La version améliore réellement le package Windows, sans être déclarée bêta
distribuable entièrement qualifiée. Restent : VM clean, 1080×1900 natif/DPI,
menus/raccourcis/association, MSI admin, WebView2 absent/offline, corpus photo et
scans réels, deskew/orientation des pixels, stress long, licences de distribution.
Signature cryptographique/updater/refonte UI restent hors périmètre.

Documentation mise à jour : README, DESKTOP, CONVERSION, QA_AUTOMATION,
TECHNICAL_DEBT et ce rapport. Les rapports 001/002/003 restent historiques.
Les commits locaux sont consignés dans le compte rendu final. Aucun fichier
utilisateur préexistant modifié, aucun artefact QA ou secret committé. Aucun push.
