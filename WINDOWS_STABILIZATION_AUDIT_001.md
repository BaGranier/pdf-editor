# WINDOWS-STABILIZATION-AUDIT-001

Audit natif du 29 septembre 2026, depuis `main`, base `fc1160f`.
Le worktree était propre avant intervention. Aucun push ni amendement.

## Conclusion et périmètre vérifié

Le build MSVC, la WebView2 réelle, les dialogues Windows, le sidecar PyInstaller,
l’installation NSIS et les parcours fonctionnels indiqués ci-dessous ont été
exécutés sur Windows 11. Les corrections répondent à des échecs observés.
**La qualification Windows générale reste incomplète** : cette machine dispose
d’un seul écran 1600×900 à 100 %. Les autres DPI, le multi-écran, le rendu
LibreOffice et les scénarios marqués NT ne sont pas déclarés validés.

Les documents utilisés sont exclusivement les fixtures synthétiques du dépôt
ou leurs copies dans `data/output`. Binaires, captures, PDF, tessdata et outils
QA temporaires restent ignorés ; aucun document personnel n’a été utilisé.

## Environnement réellement utilisé

| Élément | Résultat |
| --- | --- |
| OS | Windows 11 Professionnel, 10.0.26200, build 26200 |
| Écran | un moniteur, 1600×900 physiques ; work area (0,0,1600,852) |
| DPI | 100 %, facteur Tauri 1 ; `devicePixelRatio` WebView 1 |
| Node | 22.23.3 pour les vérifications finales et le packaging ; 24.19.0 initialement sur le PATH |
| npm | 12.1.0 ; `npm.cmd` utilisé dans PowerShell lorsque `npm.ps1` est bloqué par sa politique |
| Python | 3.11.9 |
| uv | 0.12.20, révision 2274b80d6 |
| Rust / Cargo | rustc 1.98.1 / cargo 1.98.1, stable `x86_64-pc-windows-msvc` |
| Visual Studio Build Tools | 2022, installation 17.14.37710.0 ; MSVC 14.44.35207 |
| link.exe | exécuté : version 14.44.35229.0 ; hors PATH du PowerShell ordinaire, trouvé par la toolchain lors du build |
| Windows SDK | 10.0.26100.0 |
| WebView2 | runtime 154.0.4258.37, WebView native effectivement lancée |
| Tesseract | 5.5.3.20260724, disponible sur PATH |
| Langues initiales | `eng`, `osd` ; `fra` absent |
| Langues QA | `eng`, `fra`, `osd`, avec les répertoires `configs` et `tessconfigs` complets |
| OCRmyPDF | 17.13.0, disponible sur PATH et réellement exécuté par le sidecar |
| QPDF | 12.4.2 ; contrôle du PDF OCR réussi |
| Ghostscript | `gswin64c` 10.08.0 ; traitement du PDF OCR réussi |
| LibreOffice | absent du PATH et du chemin standard `Program Files/LibreOffice/program/soffice.exe` ; validations visuelles sautées |

La version Node 22 a été placée dans le dossier QA ignoré
`data/output/windows-toolchain`. Elle n’a pas remplacé le Node global.
`link.exe` se trouve sous
`Visual Studio/2022/BuildTools/VC/Tools/MSVC/14.44.35207/bin/Hostx64/x64`.
Le build a réellement lié avec MSVC ; il ne s’agit pas d’un cross-build Linux.

Pour `fra`, une donnée officielle
[tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast/blob/main/fra.traineddata)
a été téléchargée dans `data/output/windows-tessdata`.
SHA-256 : `ced037562e8c80c13122dece28dd477d399af80911a28791a66a63ac1e3445ca`.
L’application QA a été lancée avec `TESSDATA_PREFIX` vers ce dossier complet.
Le témoin synthétique est anglais : l’exécution avec `fra` est validée, pas la
qualité de reconnaissance d’un document français réel.

### Développement et runtime

Node/npm, Python de développement, uv, Rust, MSVC et SDK servent au build.
Le sidecar contient son interpréteur et ses modules Python ; ces outils de
développement ne sont pas des prérequis de l’utilisateur final pour le viewer,
l’édition, la sauvegarde ou la conversion sans OCR.

Les outils OCR et les données de langue restent des dépendances système,
non distribuées dans les bundles actuels. OCRmyPDF présent seul ne suffit pas.
Le CLI QPDF est utilisé ici pour contrôler le PDF résultant ; le code du moteur
ne l’invoque pas directement. Sa présence n’est pas une preuve que l’OCR fonctionne.
LibreOffice sert uniquement à certaines validations visuelles DOCX : les
conversions TXT, DOCX et PNG ont fonctionné sans lui depuis le sidecar installé.

## Inspection de l’architecture existante

- Tauri 2.11.5, plugin shell 2.3.5, dialogues natifs `rfd` 0.15.4.
- Capability `core:default` uniquement ; aucun accès shell/filesystem général
  exposé à JavaScript.
- En dev, `uv run python -m app.desktop_server`, avec cwd du backend source.
- En release, `shell().sidecar("pdf-engine")` ; `externalBin` prépare le nom
  cible `pdf-engine-x86_64-pc-windows-msvc.exe`, installé comme `pdf-engine.exe`.
- Port dynamique `127.0.0.1:0`, disponibilité contrôlée via `/health`, attente
  bornée de démarrage et bouton Réessayer en cas d’erreur.
- Les chemins natifs restent en Rust, associés à des identifiants opaques.
  Save écrit un temporaire voisin, synchronise puis renomme. Save As change
  l’identifiant et la destination de la session après réussite uniquement.
- IndexedDB conserve les sources Web/générées ; les destinations natives sont
  limitées à la session et ne sont pas restaurées comme chemins valides.
- Données/cache/logs résolus par Tauri ; journal sous
  `%LOCALAPPDATA%/com.local.pdfstudio/logs/pdf-engine.log` et temporaires isolés
  sous `%TEMP%/com.local.pdfstudio/backend-<pid>`.
- Arguments PDF consommés au démarrage ; association `.pdf` déclarée, absence
  de mécanisme single-instance. Aucune persistance de géométrie existante.

## Échecs observés et corrections

| Symptôme et reproduction | Cause / correction | Validation |
| --- | --- | --- |
| `desktop:check` échoue sur `python3` sous Windows | scripts npm passés à `uv run … python -m scripts.…` | check et build Windows exécutés |
| script Python ne lance pas npm/npx Windows | résolution des `.CMD` par `shutil.which` | frontend construit par le check et le bundler |
| lecture JSON dépend de l’encodage Windows | lectures de configuration en UTF-8 | validation de configuration réussie |
| smoke sidecar reste suspendu après terminate ; enfants encore actifs | uv/PyInstaller possèdent un second processus ; arrêt de l’arbre Windows avec `taskkill /T /F`, également dans le smoke de packaging | fermeture normale dev/release : descendants absents |
| console enfant visible en dev | création du processus Windows sans console | lancement dev natif |
| fenêtre cible dépasse la work area 1600×852 avec ses décorations | dimensions initiales fixes ; calcul physique à partir de `monitor.work_area()` avec conversion explicite des cibles logiques | fenêtre extérieure 1296×836, position (152,8) |
| premier prototype de correction bloque la boucle Tauri sur déplacement | requêtes de fenêtre depuis le callback natif ; report sur thread et regroupement des événements | lancement, resize et maximiser/restaurer exécutés après correction |
| conversion packagée renvoie 502 | `sys.executable -m app.conversion.worker` relance l’entrée du binaire congelé | mode explicite `--conversion-worker` ; TXT/DOCX/PNG depuis installation |
| tests backend POSIX échouent sous Windows | `killpg`, `start_new_session`, codes terminate et noms Ghostscript différents ; paramètre PDF géant dépasse les limites d’environnement pytest Windows | assertions adaptées sans supprimer les contrôles ; 260 tests passent |
| chemins Windows échappés restent dans diagnostics | remplacement du seul chemin brut | nettoyage également des variantes JSON et POSIX ; tests de robustesse passent |
| Save As affiche l’ancien nom dans le succès | nom d’export utilisé à la place du nom natif choisi | message et onglet affichent `validation finale été.pdf` |
| PDF ouvert par argument affiche encore « Sélectionnez un PDF local » | statut initial non effacé | statut effacé au chargement des arguments |
| Échap ne quitte pas Présentation immédiatement | sélecteur masqué garde le focus ; filtre des cibles éditables exécuté avant Échap | Échap prioritaire en Présentation, test et WebView réelle |
| deuxième crash non affiché après Réessayer ; premier crash perd la session native | boucle de surveillance arrêtée sur erreur ; démontage de l’éditeur | surveillance poursuivie et session masquée, conservée pendant la récupération ; test de deux crashs avec brouillon |
| sidecar absent : détail uniquement dans l’UI | erreur de spawn non ajoutée au journal persistant | ajout `BACKEND_START_ERROR` lors de la mise en erreur du runtime |

Les premiers échecs du pilotage des dialogues (mauvais handle, bouton descendant,
champ Save As sans notification interne) étaient des défauts de l’outil QA.
Ils ne sont pas comptés comme bugs de l’application.

## Fenêtre, DPI et écrans

La fenêtre est créée masquée, ajustée puis montrée. La zone disponible et les
positions restent en pixels physiques, y compris les coordonnées négatives.
Les cibles 1280×820, minima 960×640 et marge de 8 sont logiques, converties avec
le facteur du moniteur. Les décorations sont mesurées séparément ; le minimum
est limité à la taille effectivement disponible. Aucun fullscreen imposé.

Un changement de moniteur ou de DPI déclenche un ajustement de la taille/position,
sans recentrer chaque déplacement ni annuler les redimensionnements manuels.
Les fenêtres maximisées, minimisées et fullscreen ne sont pas redimensionnées
par ce calcul. Pas de nouvelle persistance : chaque lancement recalcule sa
géométrie. La récupération d’anciennes coordonnées est testée sur la fonction
de clamp, mais aucune restauration persistée n’existe à qualifier.

API utilisée :
[Monitor::work_area](https://docs.rs/tauri/2.11.5/tauri/window/struct.Monitor.html).

| QA native | Résultat |
| --- | --- |
| Windows 11, 100 % DPI | OK, un écran 1600×900 |
| 125 %, 150 %, 175 %, 200 % | NT, aucune modification du scaling système effectuée |
| 1366×768 | NT natif ; calcul automatisé testé |
| 1920×1080 | NT natif ; calcul automatisé testé |
| 2560×1440 | NT natif ; calcul automatisé testé |
| 3840×2160 / 4K | NT natif ; calcul automatisé testé |
| écran portrait | NT natif ; calcul 1080×1920 testé |
| petit écran / VM | NT natif ; calcul 800×600 testé |
| multi-écran | NT, un seul écran disponible |
| déplacement entre DPI différents | NT |
| relance après déconnexion écran secondaire | NT natif ; clamp de coordonnées hors écran testé |
| maximiser / restaurer | OK ; bordures maximisées Windows (-8,-8) attendues, contenu limité à la work area |
| resize manuel | OK, fenêtre extérieure 1100×740 |
| Présentation fullscreen | OK, WebView 1600×900, API fullscreen Web |
| sortie fullscreen | OK par Échap, retour au viewer et dimensions normales |

Les tests mathématiques couvrent ces résolutions × les cinq facteurs DPI et des
coordonnées négatives. Ils ne remplacent pas les essais natifs des canvas,
overlays, dialogues, menus, tooltips et transitions multi-écran.

## QA fonctionnelle native

| Parcours | Résultat |
| --- | --- |
| lancement dev / release installée, backend health | OK |
| ouverture bouton et Ctrl+O | OK, dialogue Windows |
| ouverture argument, espaces/accents | OK, copie `contrat été Windows.pdf` |
| drag & drop / double-clic association | NT ; association configurée |
| chemin long / réseau / OneDrive | NT |
| readonly / verrou exclusif | tests Rust Windows OK, original préservé et temporaire nettoyé ; parcours UI complet NT |
| pages / miniatures / zoom | OK avec copie du PDF cinq pages |
| texte / signature / rectangle / dessin libre | OK ; PDF sauvegardé avec deux images et objets graphiques |
| commentaires | création UI OK ; annotation incluse dans l’export à qualifier indépendamment |
| text markup | surlignage UI OK ; variantes souligner/barrer NT natif |
| formulaires / verrouillage local | OK, champs et checkbox, verrouiller/déverrouiller |
| verrouillage formulaire dans le PDF exporté | NT natif |
| Ctrl+F | ouverture/recherche UI OK ; couverture exhaustive des résultats NT |
| undo / redo / dirty | OK sur dessin libre ; état dirty puis clean après sauvegarde |
| Save | OK, destination native écrite ; aucun téléchargement navigateur observé |
| Save As | OK, nom Unicode choisi, nouvelle source native, Save suivant écrit dans cette destination |
| overwrite | OK, confirmation Oui et remplacement du PDF QA |
| annulation Save As | OK, message d’annulation, destination et état dirty conservés |
| dossier inaccessible / backend défaillant pendant Save | NT natif ; erreurs couvertes par suites ciblées |
| export PDF | chemin natif commun à Save As inspecté ; export depuis Organiser NT natif |
| OCR eng / fra | OK, résultat ouvert, texte `SCANNED OCR WITNESS`, QPDF/Ghostscript OK |
| langue OCR absente | OK, HTTP 422 `OCR_LANGUAGE_UNAVAILABLE`, message utilisateur |
| Tesseract / OCRmyPDF / GS / QPDF manquant | tests automatisés selon couverture existante ; suppressions natives de chaque outil NT |
| multi-document / thèmes | OK, plusieurs onglets et bascule clair/sombre |
| Continu / Page unique / Présentation | OK |
| conversion | TXT/DOCX/PNG via API du sidecar installé OK ; parcours UI téléchargement NT |
| impression | aperçu iframe blob visible et bouton Imprimer exécuté ; `.print()` d’iframe WebView, pas une commande Rust ; sortie imprimée et dialogue OS effectivement utilisable NT |
| crash / retry | deuxième crash reproduit avant correction ; après correction deux crashs, deux relances et brouillon natif conservé, puis Save réussi |
| sidecar absent | erreur de spawn visible immédiatement, bouton Réessayer, chemin du journal ; pas de blocage silencieux |

## Packaging et WebView2

`npm.cmd run desktop:build` génère réellement :

- `target/release/pdf-studio-local.exe` ;
- `target/release/bundle/msi/PDF Studio Local_0.1.0_x64_en-US.msi` ;
- `target/release/bundle/nsis/PDF Studio Local_0.1.0_x64-setup.exe`.

Le NSIS a été installé silencieusement dans `data/output/Installation Windows`,
avec code retour 0, puis lancé depuis ce dossier. `pdf-engine.exe` et
`uninstall.exe` sont présents. Réinstallation de la même version testée ; upgrade
entre versions différentes et installation MSI NT. Ni signature ni mise à jour
automatique ne sont validées.

WebView2 fonctionne sur cette machine. La configuration laisse la politique
Tauri Windows par défaut
[downloadBootstrapper](https://v2.tauri.app/distribute/windows-installer/), qui
gère l’installation du runtime manquant et nécessite un téléchargement dans ce
cas. Runtime absent/endommagé et installation hors ligne NT. Aucun prérequis
manuel Node/Rust/Python développeur n’est ajouté à l’installateur utilisateur.

## Tests et commandes

Commandes Python du projet exécutées via `uv run python -m` ; outils runtime
OCR lancés par leurs exécutables système, sans introduire uv dans le runtime.

| Contrôle après corrections | Résultat |
| --- | --- |
| frontend `npm.cmd run test:run` | 54 fichiers, 286 tests passés |
| `npm.cmd run lint` | OK, TypeScript `--noEmit` |
| `npm.cmd run typecheck:e2e` | OK |
| `npm.cmd run build` | OK ; avertissement Vite existant sur taille de chunk |
| backend `uv run python -m pytest -q --tb=short` | 260 passés, 7 sautés, warnings PyMuPDF SWIG |
| `uv run python -m ruff check .` | OK |
| `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib` | 6 tests, dont Windows readonly/verrou et géométrie |
| `npm.cmd run desktop:check` | OK : frontend, health/test serveur desktop, cargo check MSVC |
| `npm.cmd run desktop:build` | sidecar /health, build release, MSI et NSIS exécutés |
| Playwright | pilotage CDP de la vraie WebView2 installée, pas une simulation navigateur de Tauri |
| suite Playwright navigateur complète | non exécutée dans cette campagne |
| LibreOffice / DOCX visuel | non validé ; dépendance absente et tests explicitement sautés |

Les appels CDP, captures et exports de campagne sont locaux et ignorés dans
`data/output`. Les copies de fixtures sont ouvertes avec le helper versionné
`scripts/windows-native-qa.ps1` ; il cible une seule instance et borne les
destinations au dépôt. Ses libellés natifs sont ceux d’un Windows français.
Le validateur `uv run --project services/pdf-engine python -m
scripts.validate-docx-visual-quality` a aussi été exécuté : code retour 0 en
mode non obligatoire, mais rapport `status: unavailable` faute de LibreOffice.
Ce résultat n’est pas un contrôle visuel vert.

## Limites restantes avant qualification générale

- compléter la matrice native DPI/résolutions/portrait/multi-écran ;
- qualifier les chemins longs, réseau, OneDrive, associations/double-clic ;
- installer LibreOffice sur le poste QA et exécuter les validations visuelles ;
- qualifier impression, export Organiser, markup complet et verrouillage export ;
- tester le MSI, un upgrade réel et WebView2 absent/hors ligne ;
- distribuer ou documenter explicitement une chaîne OCR utilisateur complète ;
- tester la fermeture forcée/crash du shell : `taskkill` nettoie les descendants
  lors d’une fermeture normale ou relance, pas après disparition brutale de Rust.

## Clôture de la campagne native

- Check, build release MSVC, sidecar `/health`, MSI/NSIS et six tests Rust
  exécutés après les dernières corrections applicatives.
- NSIS réinstallé, code 0 ; application effectivement lancée depuis le dossier
  d’installation avec le PDF Unicode `contrat été reprise.pdf` en argument.
- Deux arrêts du worker PyInstaller provoqués : erreur visible à chaque fois,
  Réessayer retrouve un backend prêt sur un port distinct. Le même onglet natif,
  son état dirty et le texte `Keep native session twice` restent présents.
  Ctrl+S écrit ce texte dans le fichier initial et efface le dirty.
- Modes de lecture, Échap immédiat, thèmes, conversion TXT/DOCX/PNG et OCR
  eng/fra répétés depuis cette installation finale. Les PDF OCR effectivement
  actifs ont été récupérés après persistance IndexedDB et validés par
  PyMuPDF/Pypdf, QPDF et Ghostscript ; texte témoin présent.
- Save As personnalisé, Save suivant et overwrite contrôlés : le PDF QA final
  contient `Overwrite Windows QA`, deux images et quatre objets graphiques.
- Fermeture normale finale : shell PID 4660 et sidecars 12244/4964 absents
  après fermeture ; temporaire applicatif `backend-4660` absent. Aucun backend
  source `uv/Python app.desktop_server` restant observé.
- Sidecar temporairement retiré de cette installation puis restauré : erreur
  visible et `BACKEND_START_ERROR` retrouvé dans le journal persistant.
- Désinstallation NSIS réellement exécutée, code 0 ; exécutables application
  et sidecar supprimés du dossier QA.
- Vérifications Git et commits locaux réalisés à la clôture ; les hashes sont
  fournis dans la réponse finale. Le worktree initial ne contenait aucune
  modification tierce. Les artefacts locaux ignorés sont conservés. Aucun push.
