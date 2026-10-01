# WINDOWS-NATIVE-QUALIFICATION-002

Campagne native du 1 octobre 2026, base propre `a9048cc`, correction runtime
`cbf559b`, scripts QA `f227cdb`. Application 0.1.0, upgrade QA 0.1.1.
Commits locaux uniquement.

## Décision de qualification

**La stabilité sur un éventail réaliste de machines Windows 11 n'est pas encore
démontrée.** Les résultats natifs portent sur une VM, un écran 1600×900 à 100 %,
WebView2 installé et des documents synthétiques. Les critères MSI installé,
DPI variés, multi-écran, impression produite et autonomie OCR restent incomplets.
Les succès historiques de l'audit 001 ne sont pas repris comme résultats actuels.

Statuts : `OK` exécuté réellement et conforme au périmètre indiqué ; `KO` échec
fonctionnel ; `R` régression observée ; `NT` non testé ; `ENV` empêché par une
limitation constatée ; `AUTO` test automatisé sans parcours natif utilisateur
équivalent ; `PARTIAL` validation incomplète. Aucun `R` n'a été établi sur les
scénarios exécutés. Collecter des métriques ne valide pas tous les outils UI.

## Environnement

| Élément | Valeur constatée |
| --- | --- |
| Machine | VM Hyper-V, CPU présenté i7-13700K, 12 processeurs logiques, x64 |
| OS | Windows 11 Professionnel, 10.0.26200, build 26200 |
| RAM | 5 118 868 Kio visibles ; 1 258 440 Kio libres au premier inventaire |
| Moniteur | un écran 1600×900 paysage, work area (0,0,1600,852), 96 DPI |
| GPU / pilote | Vidéo Microsoft Hyper-V ; 10.0.26100.1150 |
| WebView2 | 154.0.4258.48 ; véritable WebView de l'application installée |
| Node / npm | 22.23.3 / 12.1.0 ; Node 22 local sous `data/output/windows-toolchain` |
| Python / uv | `py -3.11` et environnement verrouillé 3.11.9 ; uv 0.12.20 |
| Rust / Cargo | stable 1.98.1 ; host `x86_64-pc-windows-msvc` |
| MSRV | 1.88.0 installé ; check verrouillé et huit tests lib exécutés |
| MSVC / linker / SDK | outils 14.44.35207 ; compilateur 19.44.35229 ; linker 14.44.35229.0 ; SDK 10.0.26100.0 |
| Tesseract | 5.5.3.20260724 ; système eng/osd ; dossier QA eng/fra/osd |
| OCRmyPDF / Ghostscript / QPDF | 17.13.0 / gswin64c 10.08.0 / 12.4.2 |
| LibreOffice | absent ; validateur `--required` exécuté, code 1, `status: unavailable` |
| Imprimante virtuelle | Microsoft Print to PDF présente, pilote Microsoft Print To PDF |

Inventaire JSON sous `data/output/windows-qa-002/environment`. Il enregistre les
exécutables résolus avec profil et dépôt anonymisés, les versions, RAM, GPU et
moniteurs. Node système initial : 24 ; builds et baseline utilisent Node 22
local en tête du PATH, sans remplacer le Node système. MSVC/link sont interrogés
par leur chemin, même hors PATH ; le code non nul de leur aide n'est pas un
échec de compilation. WMI/esbuild étaient refusés dans le bac à sable : les
commandes autorisées ont été réexécutées hors bac à sable. La session n'a pas
les privilèges administrateur requis par le MSI par machine.

## Inspection, correction et instrumentation

Sources web/E2E/Rust/backend, scripts et documents demandés inspectés avant
modification. Tauri cache la fenêtre, la fit avant affichage, adapte son minimum
à la work area et debounce les changements monitor/DPI. Aucune géométrie n'est
persistée. Backend sur port local dynamique : sidecar PyInstaller en release,
uv en développement. Les chemins restent dans Rust, React reçoit des identifiants
opaques. Save utilise un temporaire voisin puis rename. Les PDF en arguments
sont consommés au lancement ; aucun mécanisme single-instance ajouté.

**KO reproduit et corrigé** : `taskkill /F` du shell initial laissait les deux
processus PyInstaller actifs. Un Job Object Windows non héritable avec
`KILL_ON_JOB_CLOSE` est attaché au backend et conservé par Rust. La fermeture
du handle, y compris lors de disparition forcée du shell, termine les descendants.
Le nettoyage normal existant est conservé. `windows-sys` était déjà présent
dans le graphe verrouillé ; ses API nécessaires deviennent une dépendance directe.
La capability JS n'est pas élargie.

Huit tests Rust couvrent aussi le Job Object, un chemin Unicode >260 caractères,
la recréation d'un fichier supprimé et l'échec après disparition du répertoire.
Fixture française raster reproductible : `conversion-scan-french.pdf`, 33 906
octets, aucun texte caché. Génération isolée `--french-only`.

Instrumentation externe uniquement : inventaire PowerShell, CDP Playwright de
la WebView2 réelle, snapshots de processus et cinq lancements. Pas d'endpoint
de diagnostic release ni service externe. Les erreurs intermédiaires de focus,
attente CDP et réutilisation de PID ont été corrigées dans les pilotes, puis
les scénarios concernés relancés ; elles ne sont pas des bugs applicatifs établis.

## Fenêtres, écrans et DPI

| Résolution | Orientation | DPI | Écrans | Work area | Outer | Inner | Position | Résultat | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1600×900 | paysage | 100 % | 1 | 1600×852 (0,0) | 1296×836 | 1280×797 | 152,8 | OK | Tauri 1, DPR 1 ; fenêtre accessible et capture réelle |
| 1600×900 | paysage | 125 % | 1 | — | — | — | — | NT | scaling Windows non modifié pendant la campagne |
| 1600×900 | paysage | 150 % | 1 | — | — | — | — | NT | aucune validation déduite d'un DPR simulé |
| 1600×900 | paysage | 175 % | 1 | — | — | — | — | NT | validation native restante |
| 1600×900 | paysage | 200 % | 1 | — | — | — | — | NT | validation native restante |
| 1366×768 / 1920×1080 | paysage | divers | — | — | — | — | — | AUTO | clamp Rust ; lancement natif NT |
| 2560×1440 / 3840×2160 | paysage | divers | — | — | — | — | — | AUTO | clamp Rust ; pas de matériel correspondant |
| 1080×1920 | portrait | divers | — | — | — | — | — | AUTO | clamp Rust ; bascules natives NT |
| 800×600 | paysage | divers | — | — | — | — | — | AUTO | clamp Rust ; petit écran natif NT |
| 1280×720 / 1024×768 | paysage | divers | — | — | — | — | — | NT | non exécuté nativement |

| Scénario | Statut | Portée |
| --- | --- | --- |
| Continu / Page unique / Présentation / Échap | OK | WebView2 installée à 100 %, focus explicite du viewer |
| Canvas / backing store | PARTIAL | dimensions CSS et bitmap relevées à DPR 1 ; netteté HiDPI NT |
| Zoom 50/100/150/200, fit width/page exhaustifs | NT | combinaisons natives non exécutées |
| Maximiser/restaurer/resize répétés | NT | helper disponible, campagne complète non réexécutée |
| Multimoniteur / DPI mixtes / coordonnées négatives / déconnexion | ENV | un seul moniteur dans inventaire et Tauri |
| Clamp hors écran / coordonnées négatives | AUTO | tests Rust, aucun déplacement entre écrans réel |
| Popovers / menus / tooltips / inspector à tous DPI | NT | parcours et captures à 100 % seulement |

## Fichiers, outils et non-régression

| Parcours | Statut | Preuve / portée |
| --- | --- | --- |
| Argument CLI Unicode, espaces, extension .PDF | OK | copie `contrat été.PDF`, onglet actif et rendu natifs |
| Texte / dirty / undo / redo | OK | drag de création, texte témoin et dirty contrôlés |
| Save As / annulation | OK | dialogue Windows ; annulation conserve dirty |
| Nom `(copie) [1].PDF` avec accents | OK | fichier généré sous dossier QA ignoré |
| Ctrl+S suivant Save As | OK | destination native conservée, état clean |
| Overwrite oui | OK | confirmation Windows et nouvelle sauvegarde |
| Overwrite non / fermeture dirty / Ctrl+O | NT | non réexécuté ; audit 001 non repris comme preuve |
| Open via dialogue | NT | cette campagne ouvre les fixtures en argument CLI |
| Chemin >260 / points multiples / Unicode | AUTO | test Rust Windows, parcours UI long NT |
| Readonly / verrou exclusif | AUTO | original intact et temporaire nettoyé dans test Rust Windows |
| Fichier supprimé après ouverture | AUTO | Save recrée le fichier si le répertoire existe |
| Destination devenue indisponible | AUTO | répertoire absent : Save échoue sans écrire ; Save As attendu |
| Fichier déplacé après ouverture | NT | attendu : destination mémorisée reste l'ancienne, pas suivi du déplacement |
| Bureau / Documents / ACL readonly de dossier | NT | seules destinations synthétiques du dépôt utilisées |
| OneDrive | NT | aucune synchronisation personnelle inspectée ; scénario QA isolé restant |
| UNC / SMB / lecteur mappé | NT | aucun partage QA fourni ou créé |
| Association NSIS | PARTIAL | commande HKCU constatée et argument `%1` cité ; double-clic/Open with NT |
| Multi-instance / lancements successifs | NT | plusieurs instances possibles, aucun routage ajouté |
| Ctrl+F / thème | OK | ouverture recherche ; 20 bascules thème en stress |
| PDF 250 pages, 53 508 898 octets | OK | application installée, document actif et rendu ; pages vierges avec pièce jointe |
| Miniatures / navigation / 8 documents distincts | PARTIAL | miniatures et documents synthétiques restaurés visibles ; séquence exhaustive NT |
| Signature / image / rectangle / ellipse / dessin libre | NT | unités exécutées, variantes natives non requalifiées |
| Commentaires / markup / formulaires / checkbox / verrouillage | NT | suites automatisées existantes exécutées, requalification native NT |
| Export Organiser / réouverture de tous les outils exportés | NT | Save natif testé, parcours Organiser non réexécuté |

Attente stricte : un échec Save ne modifie pas l'original et ne laisse pas de
temporaire. Tests Windows readonly/verrouillage conformes. Les pertes d'accès
réseau et les ACL de dossier restent à qualifier dans un environnement dédié.

## Sidecar et logs

| Scénario | Statut | Résultat |
| --- | --- | --- |
| Démarrage depuis NSIS | OK | backend ready ; backend source non utilisé |
| Fermeture normale | OK | cinq répétitions, zéro descendant après 2 s |
| Deux crashs worker / deux retries | OK | nouveaux ports, même onglet, texte et dirty conservés |
| Crash shell : processus et ports | OK | zéro descendant ; backend et CDP libérés dans `CrashShell.json` |
| Crash shell : fichiers temporaires | PARTIAL | `backend-<pid>` subsiste ; nettoyage au prochain lancement non implémenté |
| Kill sidecar principal / plus de deux retries | NT | helper disponible ; séquence non exécutée |
| Fermeture pendant bootstrap / export long / OCR | NT | restante |
| Logs startup / OCR / conversion | PARTIAL | journal existant ; succès/échecs exécutés, exhaustivité des entrées NT |
| Logs spawn error / Save error | NT | pas de nouvelle qualification native de ces entrées |

Journal résolu par Tauri sous
`%LOCALAPPDATA%/com.local.pdfstudio/logs/pdf-engine.log`. UI et backend exposent
les diagnostics prévus. Les tests de masque des chemins temporaires OCR passent.
Pas d'audit exhaustif de confidentialité des messages Rust/tiers : ne pas
publier les journaux bruts de machines utilisateur. Aucun log local versionné.

## OCR

| Scénario | Statut | Résultat |
| --- | --- | --- |
| eng depuis UI installée | OK | image SCANNED OCR WITNESS, résultat rouvert et conservé |
| fra depuis UI installée | OK | nouvelle fixture française raster, une page, aucun texte source |
| Qualité témoin français | OK | Évaluation / française / caractères / détectés présents avec accents |
| PDF validation | OK | PyMuPDF et QPDF eng/fra ; Ghostscript traite le français |
| Tesseract absent du PATH du processus | OK | 503 OCR_TOOL_UNAVAILABLE, message visible |
| OCRmyPDF absent du PATH du processus | OK | 503 OCR_TOOL_UNAVAILABLE, message visible |
| fra absente / eng absente | OK | 422 OCR_LANGUAGE_UNAVAILABLE, feedback visible |
| TESSDATA_PREFIX inexistant | OK | Tesseract ignore le préfixe, utilise les langues système, OCR eng réussi |
| Ghostscript physiquement absent | NT | PATH seul ne garantit pas l'absence, découverte Windows possible |
| QPDF physiquement absent | NT | outil QA exécuté, aucune suppression système |
| Scan multipage / tourné / faible contraste / mixte | NT | pas extrapolé depuis les deux témoins simples |
| Installation guidée des outils absents | PARTIAL | composant nommé dans le message, aucun assistant de distribution |

Le sidecar contient Python et le moteur PDF, **pas OCRmyPDF ni Tesseract**.
Le backend appelle leurs exécutables. QPDF CLI est utilisé comme validateur QA,
pas directement par le code applicatif. Commande actuelle : `--output-type pdf
--optimize 0`. Les besoins Ghostscript/plugins dépendent de la version OCRmyPDF
retenue ; les qualifier sur une VM sans outils système avant distribution.

### Décision de distribution future

| Option | Avantages | Limites | Décision |
| --- | --- | --- | --- |
| A : outils système | bundle léger, maintenance séparée | installation complexe, versions variables, OCR non autonome | état actuel, insuffisant pour release grand public autonome |
| B : embarqué | offline, versions/langues contrôlées, pas de Python utilisateur | poids, audit licences, packaging | recommandé après audit |
| C : téléchargement au premier usage | installateur initial léger | réseau, intégrité, versionnement, échec offline | alternative séparée, non implémentée |

Pour B : OCRmyPDF/Python runtime, Tesseract/Leptonica, tessdata_fast eng/fra/osd
et dépendances réellement nécessaires de la version figée. Estimation de
planification **100–300 Mio installés supplémentaires**, pas mesure d'un bundle
réalisé ; langues fast de quelques Mio chacune. Peser le prototype avant budget.
Pas de redistribution supplémentaire implémentée par ce ticket.

Licences : [OCRmyPDF MPL-2.0](https://github.com/ocrmypdf/OCRmyPDF/blob/main/LICENSE),
[Tesseract Apache-2.0](https://tesseract-ocr.github.io/tessdoc/Installation.html),
[tessdata_fast Apache-2.0](https://github.com/tesseract-ocr/tessdata_fast/blob/main/LICENSE),
[QPDF Apache-2.0](https://github.com/qpdf/qpdf/blob/main/LICENSE.txt),
[Ghostscript AGPL ou commercial](https://ghostscript.com/licensing/).
Cette liste n'est pas un audit de conformité : couvrir aussi Leptonica/codecs,
pikepdf/libqpdf, plugins et notices des versions exactes. La
[documentation OCRmyPDF Windows](https://ocrmypdf.readthedocs.io/en/latest/installation.html)
décrit la découverte des outils externes. L'offre recommandée doit fonctionner
offline avec eng/fra, préserver le document en cas d'échec OCR et garder les
autres fonctions utilisables. Aucun téléchargement implicite pour la première
version offline recommandé.

## Packaging et WebView2

| Scénario | Statut | Résultat |
| --- | --- | --- |
| Build MSVC / sidecar PyInstaller | OK | Python 3.11.9, `/health` vérifié pendant build |
| MSI build | OK | 47 812 608 octets, réellement généré |
| NSIS build | OK | baseline 0.1.0 : 46 695 504 octets |
| NSIS install / launch / même version | OK | codes 0, application/sidecar présents et exécutés |
| Upgrade 0.1.0 → 0.1.1 | PARTIAL | code 0, ProductVersion/FileVersion 0.1.1, smoke/stress réussis ; préférences exhaustives NT |
| Persistance après upgrade | PARTIAL | anciens documents synthétiques IndexedDB visibles, matrice migration NT |
| NSIS uninstall / réinstallation après uninstall | OK | code 0, application/sidecar supprimés, puis 0.1.0 installée code 0 |
| MSI silencieux | ENV | réellement tenté : 1603, Error 1925, privilèges administrateur insuffisants |
| MSI interactif / launch / reinstall / uninstall | NT | aucune installation MSI réussie |
| WebView2 présent | OK | fonctionnement depuis installation NSIS |
| WebView2 absent / corrompu / bootstrap online / offline sans runtime | NT | runtime système conservé, VM correspondante non testée |
| Sans outils dev Node/Rust/MSVC/Python système | PARTIAL | binaires et Python embarqué constatés, VM sans outils dev NT |
| Signature / updater | NT | hors périmètre |

Politique effective : `downloadBootstrapper`, défaut Tauri confirmé dans les
scripts générés NSIS/WiX et la
[documentation Tauri](https://v2.tauri.app/distribute/windows-installer/).
Runtime absent : téléchargement nécessaire, aucun runtime fixe/offline embarqué.
Le scénario offline sans WebView2 n'est pas validé. MSVC/SDK/WiX sont des outils
de build, pas des prérequis manuels de l'utilisateur final.

## Impression et conversion

| Scénario | Statut | Résultat |
| --- | --- | --- |
| Ctrl+P / aperçu / bouton Imprimer | PARTIAL | iframe et demande d'impression exécutées dans WebView2 installée |
| Dialogue Windows réellement utilisable | NT | aucune interaction avec un dialogue OS qualifiée |
| Microsoft Print to PDF / comparaison / portrait / paysage | NT | imprimante présente, aucun PDF imprimé produit/comparé |
| Imprimante physique | ENV | aucune imprimante physique QA disponible |
| TXT / DOCX / PNG sidecar installé | OK | API native, multipart Unicode ; TXT accentué, DOCX lisible, ZIP de deux PNG valides |
| Conversion UI / destination native | NT | API ne valide pas téléchargement UI ou dialogue Save |
| Structure DOCX / images / PNG / Unicode | PARTIAL | DOCX et texte accentué lus, deux PNG décodés ; fidélité visuelle complète NT |
| LibreOffice visuel simple/multipage/images/tableaux | ENV | absent, validateur `--required` en échec explicite |

## Baseline performance

Application 0.1.0 corrigée (`cbf559b`, build avant commit avec mêmes sources
runtime), Windows 26200, 1600×900/100 %, profil WebView2 QA isolé, PDF numérique
deux pages. Cinq répétitions, caches OS non purgés.

| Mesure | Min | Médiane | Max | Statut / définition |
| --- | --- | --- | --- | --- |
| Lancement → HWND observé | 31 ms | 32 ms | 413 ms | PARTIAL : handle, pas premier pixel peint |
| Lancement → backend ready observé CDP | 3 251 ms | 3 254 ms | 3 329 ms | PARTIAL : inclut Node et connexion CDP |
| Lancement → canvas PDF cible | 3 291 ms | 3 297 ms | 3 488 ms | PARTIAL : proxy du rendu, pas latence interactive complète |
| Working set groupe petit PDF | 546,4 Mio | 555,3 Mio | 557,3 Mio | OK : somme incluant pages partagées plusieurs fois |

| Complément | Valeur | Statut / portée |
| --- | --- | --- |
| RAM idle sans document | 474,0 Mio | OK : profil isolé, un snapshot |
| RAM après OCR anglais | 658,6 Mio | OK : profil isolé, source/résultat ouverts |
| RAM 250 pages / 51 Mio | 854,8 Mio | PARTIAL : QA 0.1.1 avec treize documents restaurés ; pas comparable directement à l'idle isolé |
| Processus idle / petit PDF | 11 | OK : shell 1, sidecar 2, WebView2 6, conhost 2 |
| Processus après fermeture | 0 | OK : cinq répétitions |
| Sidecar taille | 38 648 053 octets | OK |
| CPU | secondes cumulées par processus dans JSON | PARTIAL : CPU% idle/scroll/zoom/OCR/export NT |
| Cold start reboot / caches purgés | — | NT |
| Stress 20 thèmes / dix conversions TXT | aucun crash observé | PARTIAL : pas tous les cycles open/close, exports PDF, OCR et resize demandés |
| Croissance mémoire/handles sur cycles longs | — | NT : stress court insuffisant pour garantir absence de fuite |

Ces valeurs sont une baseline, pas des seuils bloquants inventés. Snapshots :
working set, private bytes, CPU cumulé, handles par processus. Le collecteur
exclut les processus antérieurs au shell pour éviter les faux descendants par
réutilisation de PID. Les temps HWND/CDP doivent conserver leur protocole.

## Vérifications exécutées

| Contrôle | Statut | Résultat |
| --- | --- | --- |
| Frontend complet Node 22 | AUTO | 54 fichiers, 286 tests réussis |
| Backend complet verrouillé | AUTO | 260 réussis, 7 sautés, warnings SWIG existants |
| Ruff backend / générateur | AUTO | réussis |
| Validateur artefacts synthétiques | AUTO | TXT accentué, DOCX, deux PNG 1275×1650, témoins OCR et texte overwrite conformes |
| Lint / typecheck E2E / build web | AUTO | réussis ; warning Vite taille de chunk existant |
| Rust stable | AUTO | huit tests réussis |
| Rust MSRV 1.88 | AUTO | check verrouillé et huit tests réussis |
| desktop:check | AUTO | configuration/capabilities, build web, trois tests serveur et cargo check réussis |
| desktop:build Windows | OK | sidecar health, release MSVC, MSI et NSIS produits |
| E2E WebView2 installée | OK | fichiers, modes, recherche/thème, API conversion, OCR, erreurs OCR, retry, stress limité exécutés |
| Playwright navigateur complet | NT | ne pas confondre avec CDP natif |
| git diff --check | AUTO | exécuté avant commits locaux |

Capability : seulement `core:default`, sans shell ni filesystem général JS.
Le sidecar et les chemins restent côté Rust. Pas d'élargissement de permissions.
Helpers QA bornés au dépôt. Aucun document personnel ni secret utilisé/versionné.

## Artefacts et limites restantes

Commandes dans `QA_AUTOMATION.md`. Scripts : `windows-qa-environment.ps1`,
`windows-qa-cdp.cjs`, `windows-qa-performance.ps1`, `windows-qa-processes.ps1`
et helper natif existant. `windows-qa-validate.py` contrôle les sorties TXT,
DOCX, ZIP/PNG, OCR et le texte sauvegardé natif ; les retours à la ligne PDF
sont normalisés pour le témoin overwrite. Dossier ignoré `data/output/windows-qa-002` :
environment, window-metrics, screenshots, ocr, installers/log MSI, performance,
reports. Gros PDF généré localement et ignoré. Logs et données runtime restent
dans les répertoires Tauri usuels ; profils WebView2 de baseline dans le dépôt.
CDP 9222 loopback activé uniquement par environnement QA.
État final : application fermée, dernière désinstallation NSIS code 0,
exécutables application/sidecar supprimés. Artefacts de campagne conservés
hors Git ; aucun push. Les temporaires de crash documentés peuvent subsister.

- **NT** : autres DPI/résolutions/portrait, zoom/fit complets, max/restore/resize,
  outils/exports exhaustifs, chemin long UI/ACL/OneDrive/SMB, double-clic/Open with,
  fermetures pendant opérations, Ghostscript/QPDF absents, OCR complexe,
  WebView2 absent/offline, impression produite, CPU% et stress complet.
- **ENV** : multi-écran, MSI sans privilèges administrateur, LibreOffice absent,
  imprimante physique QA absente.
- **PARTIAL** : autonomie OCR, upgrade/persistance exhaustive, temporaires après
  crash, impression, conversion UI/fidélité, startup observé, RAM gros PDF avec
  session restaurée, stress et confidentialité exhaustive des logs.
- **KO corrigé** : descendants sidecar après crash forcé du shell.

Compléter sur machines/VM dédiées, dont une sans outils dev et une disposant
des droits MSI. Cette campagne ne coche pas les critères globaux manquants.
