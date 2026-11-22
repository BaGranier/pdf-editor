# WIN-RELEASE-002 — Qualification Windows du 22 au 23 novembre 2026

**NOT QUALIFIED / NOT FOR DISTRIBUTION · DEV-VM ONLY**

- Windows 11 Pro x64 26200.9711, VM Microsoft, 12 processeurs logiques, 4,88 Gio,
  écran 1920×1080 à 96 DPI et session interactive à jeton non élevé.
- PowerShell 5.1, MSVC 14.44, SDK 10.0.26100.0, Rust/Cargo 1.98.1
  x86_64-pc-windows-msvc, Node 24.19.0, npm 12.1.0, Python 3.11.9 x64,
  uv 0.12.20, PyInstaller 6.16.0, Tauri 2.11.5 et CLI 2.11.4.
  Tauri a invoqué NSIS 3.11. WebView2 Evergreen 156.0.4314.58
  installé, réseau disponible et Microsoft Print to PDF présent.
- Le checkout initial était détaché sur `ce83751d6e4006d55bb523097885d670e9ab04f8`
  pendant un rebase de `main`. Sept chemins en conflit et un fichier non suivi
  existaient avant l'intervention. Le travail s'est fait dans le worktree
  `data/output/win-release-002/worktree`, branche locale `win-release-002`.
  Les quatre commits locaux de l'ancien `main`, dont DESKTOP-005, sont hors
  du commit construit. Leur intégration et la non-régression des ouvertures
  concurrentes Explorer restent à vérifier après le rebase.

## Identité du paquet exact

| Champ | Valeur |
| --- | --- |
| Version précédente | `0.1.0`, seul tag local et distant `v0.1.0` |
| Version candidate | `0.2.0`, version mineure pour les nouvelles fonctions depuis le tag |
| Commit construit | `fb32c2a42aa6a2db13845ffa496b8309bca7ab8f`, worktree propre au lancement et provenance sans différence de contenu suivie |
| Installateur | `data/output/releases/windows/0.2.0/PDF Studio Local_0.2.0_x64-setup.exe`, chemin relatif au worktree |
| Taille et architecture | 59 824 170 octets, bundle x64 |
| SHA-256 du paquet testé et de sa copie | `1c351f1e3e86999d760e94990a5f71f6afb28af5397b6b84aee6ba2423c2aa65` |
| Signature | Authenticode `NotSigned`. Réputation SmartScreen sur machine vierge non testée |
| Propriétés Windows | FileVersion et ProductVersion `0.2.0`, y compris le nom du NSIS. Le moteur Python conserve la version interne `0.1.0` |
| Sidecar installé | 51 538 125 octets, `b0eaa372f1eb0182112f9393fe915066839af7dc09981b7ba73c001f4524b206`. Back-end autonome, CRT app-local et données OCR eng/fra/osd |
| Kit | Archive sources `PDF-Studio-Local_0.2.0_fb32c2a42aa6_sources.zip`, 192 347 669 octets. `THIRD_PARTY_NOTICES.zip`, 1 287 391 octets. SHA-256 des trois livrables dans `RELEASE_MANIFEST.json` |
| Vérification | `release:sources` et `release:verify` exit 0 au commit construit. Audit natif CRT, MuPDF et loader Microsoft réussi |

L'ancien RELEASE-006 `0.1.0` a été remesuré à
`b791da13feab982b07d1f9c203cc6ab58daccb4a2d474e567827323179ce8908`.
Le hash MVP-004 du rapport du 21 novembre est une autre référence historique.
Le build intermédiaire `164ff3d` a été conservé hors du kit. Tous les essais
installés de cette matrice utilisent le paquet final `fb32c2a`.

## Matrice installée

Un statut PASS porte sur le scénario décrit. Les sous-cas non exécutés et la
VM propre sont indiqués séparément.

| ID | Statut | Observation et preuve |
| --- | --- | --- |
| WIN-INSTALL-01 | PASS | Installation silencieuse NSIS, exit 0, 534 fichiers. Raccourci du menu Démarrer lancé et fenêtre observée. `installation.json`, `shortcut.json`. Parcours interactif sur machine vierge NOT RUN. |
| WIN-START-02 | PASS | Backend prêt, canvas rendu, sidecar installé et lancé avec PATH limité aux répertoires Windows. Le listener du sidecar a été observé sur 127.0.0.1 uniquement et les ports ont été fermés. `startup.json`, `launch.json`, relevés de fermeture. |
| WIN-OPEN-03 | BLOCKED | PDF ouvert par dialogue système depuis un nom Unicode contenant des espaces. Navigation d'un PDF complexe et ouverture d'une fixture de biffage vérifiées. Image ouverte dans les navigateurs. Parcours complet d'image et erreurs de fichiers à compléter dans le paquet. |
| WIN-EDIT-04 | BLOCKED | Saisie et édition de texte, undo/redo, export de biffage et réouverture vérifiés. Checklist formes, images, tampons et filigranes encore partielle dans le paquet exact. |
| WIN-SAVE-05 | FAIL | Save As annulé avec dirty conservé, destination Unicode, Save direct et confirmation d'écrasement réussis. Le PDF de 2 pages contient le témoin modifié et la source garde son SHA-256. En revanche, Save As de trois fixtures volumineuses échoue à la lecture du corps HTTP dans WebView2 avant le dialogue. Données et diagnostic ci-dessous. Disque plein et écrasement refusé NOT RUN. |
| WIN-OCR-06 | BLOCKED | eng/fra dans l'application installée avec PATH Windows seul. Deux résultats ouverts, chacun une page et texte extrait. Réseau hôte non coupé. `ocr-eng.json`, `ocr-fra.json`, `validated-ocr.txt`. |
| WIN-SEC-07 | PASS | PDF protégé temporaire fonctionnel, absent des entrées persistées et de la relance. Deux zones biffées, témoin secret absent et témoin hors zone présent dans le PDF exporté. `privacy.json`, `privacy-restart.json`, `validated-redaction.json`. Erreurs de stockage et migration vérifiées côté navigateur uniquement. |
| WIN-LINK-08 | BLOCKED | Renvoi interne vers la page 2/8 vérifié dans WebView2. Scénarios de lien externe et navigation multipage couverts dans Playwright. Contrôle natif complet restant. |
| WIN-PRINT-09 | FAIL | Ctrl+P affiche l'aperçu de la composition et l'interface enregistre la demande. Aucun dialogue Windows observé pendant l'échantillonnage ni PDF produit. Annulation OS sans objet. Export PDF vérifié. Impression externe de bout en bout NOT RUN. |
| WIN-PERF-10 | PASS | Profil QA vide. PDF 53 508 898 octets / 250 pages ouvert par dialogue natif, huit onglets ouverts en 4,719 s, zéro canvas après fermeture des onglets. Mesures RAM/CPU et arrêt dans `data/output/windows-release-perf002/`. GPU NOT RUN. |
| WIN-RESTART-11 | PASS | Fermeture et relances normales avec absence de descendant et de port résiduels sur les passages terminés. Copie temporaire protégée absente après relance. Un dialogue natif laissé ouvert par un échec de l'assistant de QA a dû être annulé avant fermeture. |
| WIN-UPGRADE-12 | PASS | Installation RELEASE-006 0.1.0 puis 0.2.0 au même chemin de test. Le thème sombre choisi dans 0.1.0 est conservé. L'enregistrement historique a été restauré et les deux exécutables historiques ont retrouvé leurs SHA-256. Preuves dans `data/output/windows-release-upgrade002/`. |
| WIN-UNINSTALL-13 | PASS | Désinstallation silencieuse exit 0, exécutable absent, aucun processus restant et témoins QA conservés hors du dossier installé. |
| WIN-REGRESS-14 | BLOCKED | Sept catégories SVG et six thèmes vérifiés dans WebView2. Campagne navigateur étendue. Signature, tampons, insertion d'image et zoom HiDPI restent à rejouer sur le paquet exact. |
| VM propre | NOT RUN | Aucun environnement vierge disponible. La VM courante contient MSVC, Python et une installation QA historique. |

La somme des working sets des dix processus liés à l'application est de
441,5 Mio au repos, 1 124,8 Mio à huit onglets et 794,3 Mio après fermeture
des onglets. La mémoire privée passe de 202,5 à 791,7, puis à 471 Mio. Le CPU
cumulé agrégé atteint 6,52 s à huit onglets et 6,58 s à l'échantillon suivant,
après 3 s d'attente et la prise de mesure. Cette série unique inclut la WebView2
et le sidecar. L'arrêt final ne laisse aucun descendant ni port. Elle ne
permet pas de conclure sur une fuite ou un SLA.

Les cinq conversions du sidecar installé ont été exercées par son API locale.
Les sorties TXT, DOCX et PNG ont été contrôlées dans le pilote WebView2.
Pour HTML, le texte des deux pages est présent. Pour JPEG, le ZIP contient
deux images avec marqueurs JPEG valides et noms de pages attendus.
Les parcours de téléchargement et d'annulation par l'interface restent partiels.

Save As a généré des réponses HTTP 200 avec 15 878 630, 26 119 201 et
27 011 976 octets annoncés. Les deux premières sont en dessous de 25 Mio,
la troisième au-dessus. La WebView2 échoue dans `Response.blob()` avec
`TypeError: Failed to fetch` et CDP `net::ERR_FAILED`. La source reste intacte.
Le message générique d'erreur réseau s'affiche avant le dialogue et avant
la vérification de taille. L'échec persiste après ouverture par dialogue
natif et relance avec chemins de profil et de temporaires raccourcis.
Un contrôle `curl.exe` avec le même Origin a reçu les 15 878 630 octets
du sidecar et produit un PDF valide. Cette preuve isole le symptôme à la
lecture de la réponse dans le parcours WebView2. La cause interne reste
ouverte. Les preuves Save et conversions complémentaires sont dans
`data/output/windows-release-save002/`. Les tests Rust contrôlent séparément
l'atomicité, la lecture seule, le verrou, les alias, le chemin long et
l'application de la limite à l'IPC.

## Warnings et tests

| ID | Baseline | Correction ou décision | Test Windows réel | Statut final et preuve |
| --- | --- | --- | --- | --- |
| QUALIF-01 | P0, machine propre absente | NSIS x64 et chaîne native reconstruits | installation dev et SHA-256 exact | BLOCKED · `final-installer.json`, matrice |
| PRINT-01 / WINDOWS-PRINT-006 | Aperçu sans dialogue | Chemin expérimental conservé. Export puis lecteur externe pour la Preview | demande sans dialogue ni PDF | OPEN · `print.json`, `print-windows-observed.jsonl` |
| SAVE-01 | Contrat Windows à vérifier | Plafond 25 Mio maintenu. Défaut de lecture du corps WebView2 reproduit sur profil QA raccourci. Cause résiduelle à isoler | nominal et annulation PASS, gros Save As FAIL, sources intactes | BLOCKER · `files.json`, `validated-save.json`, `short-profile-results.json` |
| OCR | 8 échecs OCR système avec `fra` absent | Répertoire QA local avec configurations système et langues vérifiées | 8 cas système repassés. OCR intégré eng/fra réussi, réseau hôte disponible | BLOCKED pour hors ligne strict · `candidate-backend.log`, résultats OCR |
| PRIV-01 / PRIV-02 | Corrections STAB web/moteur | Parcours installé rejoué sur fixtures synthétiques | protection temporaire et biffage de zones PASS | OPEN pour migration/erreurs de stockage en natif · `privacy*.json`, `validated-redaction.json` |
| PERF-01 | Mesures natives manquantes | Reprise sur profil QA vide, gros PDF ouvert par le dialogue natif | huit onglets et mesures CPU/RAM, arrêt sans résidu | CLOSED pour la mesure de développement · `perf-*.json`. Mesures GPU et machine vierge ouvertes. |
| EDIT-TEXT-NATIVE-003 | Chromium, trois POST réels avec indices 0, 1, 1 | `fb32c2a` reporte l'envoi et respecte l'annulation de l'effet React | 6/6 sur trois répétitions Chromium et Firefox, assertion intacte | CLOSED · `candidate-native-text-fetch.log`, `candidate-native-text-fixed.log` |
| Filigrane QA | Windows, 77 tuiles pour 99 attendues | `164ff3d` lit la fixture JSON en UTF-8 | test ciblé puis suite complète PASS | CLOSED · `baseline-tests-backend.log`, `candidate-backend.log` |
| Vite | chunk >500 kB reproduit | entrée 1 038,70 kB minifiée, 316,35 kB gzip, PDF.js importé au démarrage. Worker séparé 2 223,38 kB. Un découpage sans import différé garderait le coût du chargement initial | production et démarrage PASS | OPEN, non bloquant Preview · `final-build.log` |
| npm audit | 7 avis, 4 élevés | Vite, Vitest et dépendances d'outillage repérés. Aucun des sept noms dans l'inventaire des modules JavaScript émis. Mise à jour de la chaîne à suivre | npm ci et build Windows PASS | OPEN, outillage · `candidate-npm-audit.json`, `apps/web/build/frontend-modules.json` |
| MSVC / Python | stdout linker localisé, warnings PyInstaller/Pydantic et SWIG | Provenance et chargement du CRT contrôlés. Diagnostic conservé | compilation, tests et installation PASS dans la portée décrite | OPEN, non bloquant Preview · `final-build.log`, `candidate-backend.log` |
| WebView2 / NSIS | Bootstrap réseau si runtime absent | Contrat conservé | installation dev avec WebView2 présent | BLOCKED pour runtime absent / hors ligne et réputation · `environment.json`, `installation.json` |
| PAGE-01 / PROCESS-01 | Limites produit connues | Suivi canonique et parcours export/réouverture conservés | fonctionnement historique | DEFERRED · [Suivi STAB](../../product/STAB-2026-11.md) |

Vitest 422/422, lint, typecheck E2E et build web réussis. Pytest ciblé 29
réussis avant correction et suite complète finale 526 réussis / 8 ignorés.
Ruff PASS. Rust natif 12 réussis avec `--release --locked --lib`, ressources
Desktop source/package contrôlées via les checks statiques. Playwright
étendu 55/56, seule la transition adaptative à 250 pages a échoué dans
Firefox (rendu reçu `idle` au lieu de `ready`). Relance isolée 2/2.
Ces tests de navigateur complètent les essais réels de WebView2.

Les logs de build et des suites sont dans `data/output/win-release-002/logs/`
du checkout initial. Les preuves natives sous `data/output/windows-release-002/`
du worktree utilisent uniquement des fixtures synthétiques.

## Décision

| Gate | Résultat |
| --- | --- |
| BUILD PRODUCED | OUI |
| INSTALLER TESTED | OUI · VM de développement |
| WINDOWS QUALIFIED | NON |
| READY FOR DISTRIBUTION | NON |

Les conditions sont suivies dans le [statut Preview](../../product/MVP_STATUS.md)
et le [gate général](../../product/NEXT_STEPS.md). Les [notes de version](../../releases/0.2.0-windows.md)
décrivent le périmètre de la candidate.
