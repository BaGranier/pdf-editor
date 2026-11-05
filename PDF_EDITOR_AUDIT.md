# PDF Editor — Audit

## 1. Résumé exécutif

État global : **UTILISABLE MAIS À STABILISER**.

Audit du 28 octobre 2026, sur Windows, au commit `1a73062`. Le code et les exécutions ci-dessous priment sur les comptes rendus historiques. « OK » qualifie uniquement le périmètre indiqué, pas tous les PDF ni toutes les plateformes.

Principales conclusions :

- Le produit dépasse largement un prototype : viewer, composition, édition, sauvegarde/export, AcroForms, OCR et conversions sont implémentés et disposent de tests substantiels. Les 346 tests Vitest passent ; TypeScript et build passent. Les campagnes E2E exécutées totalisent 56 succès et 6 échecs sur 62 cas.
- La restauration d'une organisation après reload échoue réellement dans Chromium **et** Firefox : disparition du document de la session, message « 1 document n'a pas pu être restauré ». La fiabilité local-first doit passer avant l'ajout d'outils. Les fichiers sources ne sont pas modifiés ; aucune corruption du fichier original n'a été constatée.
- Recherche et formulaires standards fonctionnent sur les témoins contrôlés. Les limitations importantes sont les formulaires après réorganisation, la fidélité du texte natif et les garanties de restitution dans des lecteurs tiers.
- La distribution desktop reste non qualifiée. Impression Windows et gros Save sont des blockers signalés dans le dépôt, non rejoués nativement ici. Le contrôle desktop échoue actuellement sur une ressource de notices absente ; aucune validation de package final ne peut en être déduite.
- La suite Python complète n'est pas verte : 353 succès, 8 échecs dus à `fra` manquant dans Tesseract système, 23 skips. Après préparation, les 18 tests ciblant le runtime OCR embarqué passent.

Prochain chantier recommandé : **fiabiliser la persistance et la restauration navigateur après organisation, sans perdre les données récupérables**.

---

## 2. Git / repository

Branche : `main`.
Commit : `1a73062` — `docs(release): record final Windows gate and unresolved blockers`.
Worktree initial : propre (`git status --short` vide). Aucun changement préexistant à préserver.

Derniers développements, d'après les 15 derniers commits :

- gate Windows et blockers de diffusion ; CSP des frames d'impression et restitution des erreurs Save ;
- compression des images partagées, préservation des fontes et ressources PDF ;
- inventaire du sidecar gelé et notices des composants redistribués ;
- préparation reproductible des fixtures et workflow clone neuf ;
- extraction de l'orchestration OCR/conversion, robustesse stockage/composition/clavier ;
- PDF protégés et correction manuelle de rotation avant OCR.

Aucun commit réécrit, aucun fichier supprimé, aucun push.

---

## 3. Architecture actuelle

Frontend :

- React 19 / Vite / TypeScript, PDF.js (`pdfjs-dist`) dans un worker. Canvas et couche texte PDF.js, overlays DOM/SVG pour l'édition. Continu : toutes les coquilles de pages restent dans le DOM, rendus lourds limités à la fenêtre visible + deux pages de marge. Page unique/présentation : transition à deux buffers, rendu adapté au DPR.
- `pdf/documentLifecycle.ts` possède fichiers, tâches PDF.js, restauration et libération. Chaque document conserve sa source ; le plan `organize/pagePlan.ts` référence document/page source, rotation et ordre de sortie.
- État principalement dans `App.tsx` : documents, sélection, plans, outils, dialogues et opérations asynchrones. Reducer `editing/state.ts` par document : edits, révisions sauvegardées, dirty, undo/redo borné à 100 snapshots. L'organisation utilise un état externe à cet historique : ne pas promettre un undo universel des changements de pages.
- IndexedDB v2 : PDF complets et assets d'images ; localStorage : préférences et plans. Persistance documentaire différée de 250 ms ; ces écritures n'ont pas une transaction commune avec les plans/préférences. Fallback mémoire et warnings de quota existent. Les sources natives Tauri et destinations de sauvegarde ne sont volontairement pas restaurées.
- Coordonnées d'édition en espace PDF, transformations via `PageViewport`. Recherche : offsets logiques dans le texte source, puis rectangles de `Range` dans la couche texte actuellement rendue. Texte natif : extraction à la demande par page et aperçu backend ; pas de reflow général du PDF.
- `saving/exportPayload.ts` construit un contrat multipart unique pour Save, Save As, export et impression ; `exportRequest.ts` traite la réponse. OCR/conversion sont isolés dans `hooks/useDocumentProcessing.ts` et traitent **le fichier source**, pas les modifications non exportées.

Backend :

- FastAPI avec schémas Pydantic ; pypdf assemble/préserve les structures, PyMuPDF traite texte, rendu et éditions, python-docx reconstruit les DOCX. Routes principales : `/pdf/export/organize`, `/pdf/native-text*`, `/pdf/forms`, `/pdf/annotations`, `/ocr`, `/convert` et déchiffrement.
- Assets binaires multipart, contrats TypeScript et Python écrits séparément. `packages/shared` n'a pas de contrat runtime partagé à réutiliser ; éviter de recréer des modèles manuellement dupliqués.
- OCR et conversion : workers isolés, temporaires, délais et limites de ressources. Deux parcours OCR : système en développement web ; MuPDF/Tesseract + ressources verrouillées dans le sidecar gelé. Le backend n'est pas un service distant.

Desktop :

- Tauri v2 partage le frontend. Rust choisit un port loopback, lance le backend source via uv en debug et le sidecar PyInstaller en release, contrôle `/health` (timeout 20 s), expose état/retry et conserve les chemins natifs derrière des IDs opaques.
- Dialogues Open/Save/Save As Rust, écriture temporaire puis remplacement. Premier Save vers une copie ; source préservée. Windows : Job Object pour les descendants, nettoyage des temporaires anciens sous conditions. Configuration du bundle : NSIS/MSI selon plateforme, association `.pdf`, WebView2 `downloadBootstrapper`.
- Impression via API Web dans la WebView, sans commande Rust native d'impression. La conversion utilise encore `downloadConversionFile`, sans destination native dédiée pour les DOCX/TXT/images. Lancement `.pdf` par arguments implémenté ; pas de routage single-instance.
- Le script de build prépare sidecar/OCR/notices. Leur présence dans la configuration ne prouve ni leur inclusion effective dans un nouveau package, ni l'installation sur machine sans outils de développement. Signature Windows, notarisation macOS et mise à jour automatique non configurées.

Tests : Vitest, pytest, Playwright Chromium/Firefox, tests Rust, scripts QA natifs. Fixtures versionnées sous `e2e/fixtures`, corpus volumineux et preuves générées ignorés. Aucun document personnel consulté.

Volumes mesurés, lignes totales : `App.tsx` **5 914**, `App.css` **3 689**, backend `main.py` **2 389**, `docx_converter.py` **1 672**, Rust `lib.rs` **919**. L'orchestration frontend et l'export backend restent les principaux points de couplage.

---

## 4. État fonctionnel

| Fonctionnalité | État | Commentaire |
|---|---|---|
| Ouverture PDF | OK | Exécutée dans les deux navigateurs ; erreurs/protection couvertes aussi par tests unitaires/backend. |
| Navigation pages | OK | Modes et changement de page exécutés ; portée des tests supplémentaires en section 5. |
| Miniatures | OK | Présentes et utilisées dans les parcours d'organisation/navigation exécutés ; pas de stress gros PDF ici. |
| Zoom / fit | OK | Tests de calcul Vitest et modes viewer ; sonde de recherche à 110 % et resize. HiDPI natif non vérifié. |
| Mode continu | OK | Parcours viewer Chromium/Firefox exécutés ; virtualisation lue, stress extrême non exécuté. |
| Page unique | OK | Navigation et transition exécutées sur les deux navigateurs. |
| Présentation | OK | Entrée, navigation, Escape et netteté canvas testés en navigateur ; fullscreen natif multi-écran non vérifié. |
| Multi-documents | OK | Export multi-source sans modification des sources exécuté ; mémoire longue durée non vérifiée. |
| Édition texte | PARTIEL | Texte ajouté sauvegardé/réouvert ; édition native limitée aux spans supportés. Réserve de fidélité preview/export, section 6. |
| Signatures | OK | Signature graphique créée et sauvegardée dans l'E2E ; signature cryptographique non implémentée. |
| Formes | OK | Tests composants/géométrie et export backend exécutés ; campagne UI complémentaire détaillée ci-dessous. |
| Dessin libre | OK | Tests composants/géométrie et export backend exécutés ; pas de qualification stylet native. |
| Commentaires / annotations | OK | Tests unitaires et export/réouverture backend exécutés ; pas de promesse sur toutes les annotations PDF existantes. |
| Text markup | OK | Sélection/géométrie et export testés ; les interactions ne constituent pas une édition générale d'objets PDF. |
| Undo / redo | PARTIEL | Reducer, coalescence et dirty testés ; organisation des pages hors historique d'édition, historique non restauré après reload. |
| Dirty state | OK | Tests de révisions et E2E Save/annulation exécutés ; verrou UI local sans dirty, verrou PDF avec dirty. |
| Save | PARTIEL | Web : téléchargement/réouverture et annulation exécutés. Desktop : code présent, gros IPC et dialogues finaux non qualifiés ici. |
| Export PDF | OK | Composition simple/multi-source et contrôle pypdf exécutés ; compression/ressources/AES couverts côté backend avec skips explicités. |
| Recherche Ctrl+F | PARTIEL | Correspondances, boxes initiales, zoom, resize et navigation sur deux pages contrôlés. Recherche du document source : pas un index de toute composition multi-source ni du texte ajouté. |
| Formulaires PDF | PARTIEL | Texte, checkbox, lecture des champs et réouverture du Save vérifiés sur Chromium/Firefox et PyMuPDF ; limites organisation/XFA. |
| Verrouillage / comportement des formulaires | PARTIEL | Verrou UI éphémère distinct du ReadOnly exporté ; tests UI, undo et backend passent. ReadOnly n'est pas une protection cryptographique. |
| Impression | PARTIEL | Aperçu et PDF courant préparés, test UI vert ; dialogue Windows/fichier imprimé non obtenus lors du dernier gate consigné. Aucun retest natif dans cet audit. |
| OCR | PARTIEL | 18 tests du runtime embarqué passent ; système `fra` absent, qualité réelle et deskew/orientation automatique non qualifiés. Rotation manuelle implémentée. |
| Conversions de fichiers | PARTIEL | DOCX/TXT/HTML/PNG/JPEG couverts par pytest exécuté ; fidélité DOCX complexe et rendu LibreOffice non validés ici. Destination native desktop à traiter. |
| Persistance / reload | KO | QA-E2E-010 échoue dans les deux navigateurs après organisation. D'autres parcours de persistance passent ; aucune garantie générale de restauration. |
| Thème clair / sombre | OK | E2E de bascule/persistance exécuté sur Chromium et Firefox ; campagne visuelle exhaustive non exécutée. |
| Desktop Tauri | PARTIEL | Architecture native réelle et 3 tests serveur passent ; `desktop:check` échoue sur notices absentes. Ni installation ni WebView native qualifiées ici. |

Recherche : les sondes additionnelles contrôlent « Montant », puis 110 %, resize 1440×960 → 1180×820 et navigation du résultat 1/2 à 2/2 dans une fixture synthétique de deux pages. Les boxes restent alignées avec la couche texte sur ces témoins ; ne pas étendre cette preuve aux rotations, ligatures, texte Unicode normalisé de longueur différente ou pages composées externes.

Formulaires : détection des widgets via PDF.js puis extraction backend par page ; HTML interactif pour champs éditables, apparence canvas pour le champ ReadOnly original afin d'éviter les doublons. Le backend refuse explicitement les valeurs/verrous lorsque le plan n'est plus préservé (`422`, `test_forms.py`). Pas de support XFA. Le Save des sondes conserve `person.name = Alice Audit` et checkbox `Off`, relus dans l'UI puis dans PyMuPDF. La fidélité visuelle finale sous Acrobat/lecteur tiers n'a pas été qualifiée.

Workflow d'impression exact : **Ctrl+P/menu → export backend de l'état courant → aperçu applicatif iframe blob → clic Imprimer → seconde iframe cachée → `contentWindow.print()` dans le navigateur/la WebView**. Pas de nouvel onglet automatique. Le bouton de secours ouvre explicitement le PDF avec `window.open`. `afterprint`, navigation ou timeout de 120 s libèrent la frame ; « dialogue demandé » ne prouve pas qu'un dialogue OS s'est ouvert. Le workflow est volontaire ; son résultat Windows est incomplet/en échec d'après le gate versionné. La correction CSP existe mais ne suffit pas à fermer le bug.

---

## 5. Tests

Environnement : Windows, Node **24.19.0** (référence CI : 22), npm **12.1.0**, Python **3.11.9**, uv **0.12.20**, Rust **1.98.1** (CI desktop : 1.88). Aucun résultat CI distant supposé.

Frontend :

- Avant `npm ci`, commandes impossibles : `vitest`/`tsc` absents. Après installation depuis le lockfile : **65 fichiers, 346 tests passent** ; `lint`, `typecheck:e2e`, `build` passent.
- `lint` signifie ici **`tsc --noEmit`**, pas ESLint ni analyse de style.
- Build : JS principal 914,62 ko, worker PDF.js 2 222,99 ko, CSS 66,50 ko avant gzip ; warning chunk >500 ko non bloquant.
- `npm audit --json` : **7 paquets signalés, 4 high et 3 moderate**, zéro critical. Vite, Vitest/@vitest/mocker et transitives d'outillage, dont undici/browserslist/source-map-js/baseline-browser-mapping. Exposition réelle à analyser séparément du score ; aucune exploitation de l'application démontrée, aucun `audit fix` effectué. Détail local : `data/output/audit-current/npm-audit.json`.

Backend :

- Suite complète `uv run pytest -ra` : **353 passed, 8 failed, 23 skipped**, 384 collectés. Ruff : **All checks passed**.
- Les huit échecs sont `test_system_deskew_measurement` : appel OCRmyPDF `fra+eng` sort avec code 3. Rejeu direct : **données de langue `fra` absentes**. Limitation de l'environnement système, pas preuve d'une régression du runtime embarqué ; la suite complète reste néanmoins en échec.
- Ressources OCR préparées par le script existant (4 fichiers verrouillés validés), puis `test_ocr_orientation.py` + `test_ocr_runtime.py`, hors `system_deskew_measurement` : **18 passed, 8 deselected**. Ce résultat inclut worker réel et route supervisée ; il ne qualifie pas le sidecar gelé installé.
- Skips initiaux : 15 tests faute de ressources OCR préparées ; 5 validations DOCX/visuelles ou toolchain, 2 documents privés non autorisés/configurés, 1 vérification AES pypdf faute de dépendance crypto optionnelle. Aucun document privé recherché. Ne pas additionner les deux exécutions en une fausse suite complète verte.

E2E :

- Inventaire Playwright : **186 cas dans 45 fichiers**, répartis entre Chromium et Firefox. Couverture écrite : ouverture/navigation, modes viewer, outils d'édition, commentaires, formulaires, recherche, save/export, stockage/migration/quotas, OCR/conversion, protections, composition, assets, accessibilité et snapshots.
- Première tentative bloquée par navigateurs absents : 3 échecs de lancement, 19 non exécutés ; aucun bug produit déduit. Navigateurs ensuite installés sous `.playwright-browsers`.
- Campagne principale, **8 specs × deux navigateurs : 34 cas, 31 passed / 3 failed**, aucun skip. Recherche (2), formulaires (2), aperçu impression (1), persistance (3), organisation (3), Save (3), export (2), modes viewer (1), par navigateur.
- Échecs : `QA-E2E-010` Chromium/Firefox (document absent après reload) ; `QA-E2E-008` Chromium (`NotFoundError` dans le helper qui interroge le store `documents`). Ce dernier est un signal de course d'initialisation du test/stockage à isoler, pas une preuve suffisante de corruption applicative.
- Sondes locales supplémentaires : deux navigateurs, recherche zoom/resize/changement de page et formulaire édité → Save → réouverture : **succès**. Script et résultats ignorés dans `data/output/audit-current/probes.cjs`, `probes.json`, PDF synthétiques `form-*.pdf`.
- Campagne complémentaire, 7 specs × deux navigateurs : **28 cas, 25 passed / 3 failed**, aucun skip. Formes, dessin, commentaires, markup et zoom/navigation passent. Échecs : `EDIT-TEXT-NATIVE-003` Chromium (trois requêtes au lieu de deux attendues) et `EDIT-TEXT-FIDELITY-001` dans les deux navigateurs (écart vertical de **0,75 px / 0,80 px**, tolérance **<0,5 px**). Ce sont des échecs actuels, déjà évoqués dans la documentation, pas une régression nouvellement datée. La cause du compte de requêtes reste à isoler ; l'assertion de fidélité échoue avant de valider toute la suite du scénario.
- Total des deux campagnes terminées : **62 cas exécutés, 56 succès et 6 échecs**. Les sondes locales sont comptées séparément. Les 124 autres cas de l'inventaire n'ont pas été exécutés.
- Aucun `test.only`/`test.fixme` ni TODO/FIXME/HACK trouvé dans les répertoires source/tests inspectés. Cinq appels `test.skip` conditionnels dans `multi-document.spec.ts` dépendent de la fixture >50 Mo. Les scénarios `@slow` sont exclus de la CI PR rapide ; la complète est manuelle. Tests DOCX visuels exigés seulement dans la complète configurée à cet effet.

Desktop :

- `npm run desktop:check` : configuration/capability validées, build web réussi, **3 tests serveur desktop réussis** ; `cargo check --locked` échoue : `services/pdf-engine/build/ocr/notices` absent. Ce sont des ressources générées requises par `tauri.conf.json`, pas une erreur Rust fonctionnelle prouvée. Le check ne les prépare pas et accepte initialement le mode source sans sidecar.
- Les ressources OCR préparées ensuite ne créent pas les notices/runtime-notices du package. Aucun faux répertoire ni contournement ajouté pour verdir Cargo.
- CI desktop actuelle : contrôle Linux, pas build/installation Windows ni macOS. Son déclenchement par chemins n'englobe pas tous les scripts de packaging/notices ; évolution de ces scripts à requalifier explicitement.

Tests non exécutés : campagne E2E complète 186 cas, corpus >50 Mo et stress mémoire long, matrice visuelle complète, LibreOffice/Word/Acrobat, nouveaux build/installateur/sidecar gelé, tests Rust `cargo test --lib`, dialogues Windows/Print to PDF, VM clean, DPI/multi-écran natifs, Linux/macOS natifs. La disponibilité du poste Windows ne remplace pas ces validations spécifiques.

---

## 6. Bugs / régressions connus

### P0

- **RESTORE** — reproduit maintenant : ouvrir une fixture 5 pages, déplacer/dupliquer/supprimer/tourner via `QA-E2E-010`, reload ; document absent sur Chromium et Firefox. Cause non isolée. La restauration avale les exceptions individuelles et ne fournit qu'un compteur ; préserver les enregistrements récupérables doit faire partie de la correction. Impact : perte d'accès à la session locale, sans preuve de modification de la source.
- **PRINT Windows** — échec natif consigné dans `NEXT_STEPS.md`/`TECHNICAL_DEBT.md`, non reproduit dans cet audit : chargement des frames corrigé, mais aucun dialogue Windows/fichier produit. L'E2E actuel valide seulement l'aperçu.
- **SAVE volumineux Windows** — risque non fermé, consigné sur une candidate intermédiaire de 25 327 909 octets : API répond, Save As non affiché, session occupée. La réduction des images par compression ne qualifie pas le transport d'autres gros PDF. Ni confirmé ni infirmé nativement ici.

Les obligations de distribution et la VM clean sont des **gates P0 de release**, pas des bugs applicatifs démontrés.

### P1

- **Reproductibilité desktop** — échec actuel de `desktop:check` sur notices générées manquantes ; absence de bootstrap/précondition vérifiée avant compilation. Contrôle complet et tests Rust non validés dans cet état.
- **Persistance QA** — `QA-E2E-008` Chromium interroge un store IndexedDB inexistant ; distinguer course du helper, initialisation produit et panne de restauration avant de corriger.
- **Fidélité texte** — `EDIT-TEXT-FIDELITY-001` échoue à 100 % : décalage vertical de 0,75 px Chromium / 0,80 px Firefox, au-delà du seuil 0,5 px. Écart mesuré de preview ; la preuve de fidélité complète jusqu'au PDF exporté n'est donc pas obtenue par ce scénario.
- **Extraction native QA** — `EDIT-TEXT-NATIVE-003` Chromium mesure trois requêtes au lieu de deux. Signal d'extraction supplémentaire ou de synchronisation du test ; pas de preuve de fuite mémoire ni d'extraction de tout le document.
- **AcroForms + organisation** — restriction confirmée par code et tests : valeurs/verrous non exportables avec pages réorganisées. Limitation connue, pas régression nouvellement datée ; l'UX doit empêcher de découvrir le refus uniquement au Save.

### P2

- Recherche sur le fichier source : couverture des pages externes composées, du texte ajouté et de certains cas Unicode non établie. Risque fonctionnel visible dans `usePdfSearch.ts` ; ne pas annoncer ces parcours pris en charge.
- Conversions desktop sans commande de destination native, via mécanisme de téléchargement Web ; résultat installé non vérifié.
- OCR/conversion traitent la source sans les edits courants ; les avertissements observés dans les dialogues visent les changements d'organisation. Clarifier aussi le cas des seules éditions avant traitement pour éviter une sortie surprenante.
- Les avertissements de débordement texte sont exposés en best effort : l'export peut étendre/tronquer une zone ; ne pas confondre succès du téléchargement et fidélité garantie.

---

## 7. Dette technique

- `App.tsx` mêle toujours viewer, page runtime, organisation, persistance, édition et opérations fichiers malgré les extractions existantes. Découper après stabilisation, un domaine à la fois ; pas de refonte préalable au bug de restauration.
- Le stockage partage plusieurs supports et timings ; fallback mémoire, transactions d'assets et révisions sauvegardées rendent les races difficiles à observer. Besoin de diagnostics non sensibles et de garanties explicites de durabilité.
- Contrats TS/Pydantic distincts ; tests de payload utiles, mais risque de divergence. Contrat généré à envisager quand il a deux consommateurs réels.
- `main.py` centralise schémas, validation, composition, fontes, formulaires et export ; dépendance aux structures PDF de bas niveau. Contournement de `rewrite_images` PyMuPDF explicite et testé : ne pas le supprimer sans requalification des fontes/images partagées.
- Preview DOM/canvas et PDF final suivent des moteurs différents ; zones sensibles : métriques de fontes, baseline, rotations, ReadOnly, opacité et ordre des couches.
- Nombreux appels page-scoped renvoient le fichier complet au backend. Temps/copies mémoire à mesurer avant changement d'architecture.
- Bibliothèque de fontes : côté backend chemin calculé vers `apps/web/public/fonts`, alors que le script PyInstaller observé ajoute explicitement les ressources OCR. La résolution des fontes intégrées dans un vrai package doit être prouvée ; ce n'est pas démontré par le build Vite qui copie les assets web.
- Logs de diagnostic Tauri/WebView et `console.warn` de couche texte existent ; certains nettoyages/restaurations utilisent des catches sans détail. Pas de journalisation documentaire confidentielle nécessaire pour rendre ces erreurs exploitables.
- Dette QA : assertions géométriques serrées et compteurs de requêtes, préconditions OCR incomplètes, helper IndexedDB trop présomptif, scripts Windows avec chemins de campagnes historiques. Tests écrits ≠ preuve récente.

---

## 8. Documentation

À jour :

- **TOUJOURS PERTINENT** — `README.md`, `DEVELOPMENT.md`, `CONVERSION.md` : architecture, contrats, limites DOCX/OCR, distinction fichiers sources/edits, stockage v2 et stratégie Save correspondent au code inspecté. Corriger seulement les garanties affectées par les échecs actuels.
- **TOUJOURS PERTINENT** — `NEXT_STEPS.md` : gates Windows explicitement ouverts ; ne pas les fermer sur la base de tests Web.
- **TERMINÉ** — extraction OCR/conversion, partage multipart Save/export/print, protection avec mot de passe ponctuel, rotation manuelle OCR, budgets d'images et virtualisation : code et tests présents, éléments utiles à conserver comme capacités et limites plutôt que futurs tickets.
- **TOUJOURS PERTINENT** — `SIGNATURE_NUMERIQUE_004.md` : signature cryptographique absente ; chantier différé, non requis pour stabiliser la release.

Obsolète :

- **OBSOLÈTE** — fin de `DESKTOP.md`, « aucune politique de distribution […] établie », contredit sa section AGPL approuvée, le README et `LICENSE`.
- **OBSOLÈTE** — introduction `TECHNICAL_DEBT.md` indiquant l'ouverture des PDF protégés non implémentée ; code `passwords`, tests exécutés et README prouvent l'inverse. Ne pas créer un ticket pour réimplémenter cette capacité.
- **OBSOLÈTE** — renvois à `PROJECT_REVIEW.md`, `WINDOWS_NATIVE_QUALIFICATION_002.md`, `WINDOWS_STABILIZATION_AUDIT_001.md`, `QA_EDITOR_EXPORT_PRESENTATION_003.md`, `QA_BROWSER_REPORT.md` absents du checkout. Ces liens ne sont pas des preuves consultables.

À revoir :

- **DUPLIQUÉ** — `DESKTOP.md` répète build/OCR, géométrie de fenêtre et redistribution avec des versions contradictoires. Conserver une section active par sujet et des liens vers les preuves ignorées, sans recopier la roadmap.
- **TOUJOURS PERTINENT**, à préciser — `QA_AUTOMATION.md` documente honnêtement les réserves, mais la commande desktop nécessite des ressources non préparées par le check ; le helper `print` n'est pas une qualification OS.
- **TOUJOURS PERTINENT**, à revalider — `NATIVE_TEXT_EDITING.md` décrit le pipeline ; résolution des fontes dans le sidecar et fidélité réelle restent à qualifier.
- `QA_BROWSER_CHECKLIST.md`, `QA_BROWSER_REPORT.md` et fichiers `TODO*` : absents des fichiers trouvés. Aucun contenu historique supposé.

---

## 9. Risques

- **Durabilité** : session navigateur non fiable au reload ; préférences/plans et PDF ne sont pas publiés atomiquement ensemble. C'est plus urgent que de nouveaux outils d'édition.
- **Faux vert** : Vitest/build verts alors que restauration E2E échoue ; aperçu impression vert sans dialogue OS ; tests de worker OCR verts sans package installé ; tests structurels DOCX sans rendu Word/LibreOffice.
- **Distribution** : stratégie AGPL enregistrée dans le dépôt, mais sources correspondantes et notices transitives/CRT à fermer. Cet audit n'est pas une validation juridique ; il constate l'absence de clôture technique documentée.
- **Confidentialité locale** : le mot de passe d'ouverture n'est pas persisté, mais la copie de travail déchiffrée peut l'être dans IndexedDB, comme indiqué dans le README. Save produit une copie non chiffrée sauf export final protégé explicite.
- **Mémoire** : documents PDF.js + Blob/File + copies multipart/IPC + historiques + buffers canvas/GPU ; limites 50 Mo/250 pages/8 documents sont des warnings, pas des bornes du viewer. Budgets images et worker OCR existent mais ne plafonnent pas toute la RAM du processus.
- **Performance** : bundle principal ~915 ko et worker ~2,22 Mo ; scans/gros exports/multi-documents doivent être mesurés sous WebView native. Aucune fuite mémoire nouvelle démontrée par cet audit.
- **Dépendances** : audit npm avec alertes réelles à trier ; versions backend verrouillées, mais pas d'audit de vulnérabilités Python/Rust exécuté. Une version ancienne ne suffit pas à conclure à une faille exploitable.
- **Plateformes** : Windows installé/VM clean à requalifier ; Linux exige bundle/WebKitGTK/dialogues natifs ; macOS exige son build, signature/notarisation et qualification. Les résultats navigateur Windows ne couvrent pas ces plateformes.

---

## 10. Roadmap recommandée

### P0

**1 — Persistance et restauration fiables**

- Pourquoi : échec reproduit sur les deux navigateurs, affectant la promesse local-first.
- Travail : isoler octets/Blob, écriture durable et réhydratation ; préserver les enregistrements non restaurables ; corriger le défaut et la course du helper sans retirer le reload.
- Dépendances : aucune nouvelle dépendance majeure.
- Critère de sortie : QA-E2E-010/008 verts Chromium/Firefox en campagne et répétitions ciblées, plus migration/quota/edits/assets ; sources intactes et état récupérable après erreur.

**2 — Impression effective Windows**

- Pourquoi : l'aperçu ne garantit pas l'ouverture du dialogue WebView2.
- Travail : reproduire sur package final, isoler la limite du workflow iframe/print, définir un parcours supporté et retour d'erreur fiable.
- Dépendances : artefact Windows identifiable et poste interactif.
- Critère de sortie : portrait multipage et paysage imprimés vers Microsoft Print to PDF, fichier rouvert et contenu/annotations/formulaires contrôlés ; annulation et absence de dialogue gérées.

**3 — Save natif de fichiers volumineux**

- Pourquoi : le correctif de compression masque potentiellement le volume de transport ; le symptôme >25 Mo n'est pas fermé.
- Travail : fixture synthétique indépendante, mesurer API → Blob → IPC → dialogue → écriture ; corriger seulement le goulot reproduit et couvrir les erreurs.
- Dépendances : package Windows ; mesures hors profils de compression.
- Critère de sortie : Save As puis Save d'un export au moins comparable au témoin de 25,3 Mo, fichier vérifié, interface récupérable, annulation/droits/chemin long sans perte de source.

**4 — Gate de distribution Windows sur artefact final**

- Pourquoi : conformité du package et autonomie d'installation toujours ouvertes.
- Travail : fermer sources/notices transitives et ressources, tracer les hashes, exécuter NSIS/upgrade/désinstallation et OCR offline sur VM clean ; tester WebView2 absent online/offline, associations et matrice DPI.
- Dépendances : axes 2/3/5, VM clean et décisions de distribution déjà enregistrées.
- Critère de sortie : matrice de release reliée à un unique installateur, aucun P0 ouvert ; limites plateformes explicitement publiables. Aucun push/publication demandé par cet audit.

### P1

**5 — Vérifications reproductibles et entretien ciblé des dépendances**

- Pourquoi : check desktop bloqué, suite système OCR dépendante de `fra`, alertes npm et différences Node/MSRV.
- Travail : préconditions/bootstrap de ressources générées pour check/Cargo, distinguer checks sources/package ; détection correcte de langues OCR ; tri des alertes et mises à jour minimales justifiées ; couvrir les scripts de packaging dans la CI adaptée.
- Dépendances : aucun ajout majeur sans accord ; accès aux ressources verrouillées.
- Critère de sortie : procédure clone neuf exécutée sur Node 22/Rust minimal supporté, résultats backend explicites, desktop check et tests Rust verts, alertes résolues ou exposition documentée. Pas de faux placeholders de release.

**6 — Contrats de fidélité et interactions PDF**

- Pourquoi : formulaires après organisation non supportés, preview/export texte à resserrer, recherche partielle sur composition.
- Travail : fixer le périmètre produit, prévenir les parcours refusés, intégrer des tests recherche zoom/resize/navigation et formulaires Save/réouverture ; traiter métriques texte après reproduction, pas par élargissement arbitraire des tolérances.
- Dépendances : axe 1 stabilisé ; décision explicite avant élargissement AcroForms multi-source.
- Critère de sortie : parcours supportés UI/export cohérents, limites visibles, sentinelles texte et réouverture formulaires vertes, échantillons contrôlés avec lecteur indépendant.

### P2

**7 — Qualification OCR/conversions et destination desktop**

- Pourquoi : moteurs web/gelé distincts, DOCX complexe limité, téléchargement de conversion encore Web.
- Travail : corpus synthétique représentatif eng/fra/mixte, rotation manuelle et qualité ; contrôle visuel LibreOffice/Word ; choix explicite de destination pour conversions natives et message sur modifications non exportées.
- Dépendances : axe 5, lecteur bureautique pour validation ; deskew automatique seulement si besoin mesuré.
- Critère de sortie : résultats mesurés par format/runtime, erreurs et limites lisibles, sorties desktop retrouvables et réouvrables ; aucune promesse de DOCX pixel-perfect.

**8 — Réduire le couplage et consolider la documentation**

- Pourquoi : orchestration et références historiques ralentissent les évolutions et diagnostics.
- Travail : extraire progressivement persistance/cycle de vie puis export, garder des contrats explicites ; supprimer les contradictions documentaires sans multiplier les roadmaps.
- Dépendances : axe 1 corrigé et sentinelles en place.
- Critère de sortie : modules de domaine testables, campagnes transverses sans régression, documentation active sans renvoi cassé indispensable. Pas de réécriture globale.

### P3

**9 — Budgets mémoire et performance mesurés**

- Pourquoi : avertissements non bloquants, copies multiples et limites de mesure JS/GPU.
- Travail : 20 assets distincts, cycles exports/fermetures, gros PDF/multi-documents ; mesurer RAM/CPU/handles natifs puis cibler pruning, copies ou découpage bundle.
- Dépendances : parcours fonctionnels stabilisés et machine cible.
- Critère de sortie : budgets réalistes, mesures reproductibles et absence de croissance injustifiée après plusieurs cycles ; optimisations justifiées par mesures.

---

## 11. Prochains tickets

1. **Corriger la restauration navigateur après organisation et sécuriser les données persistées** (P0).
2. **Obtenir une impression Windows réelle depuis le package Tauri** (P0).
3. **Qualifier puis corriger le Save/Save As natif de PDF >25 Mo hors compression** (P0).
4. **Rendre les vérifications clone neuf reproductibles : ressources desktop, OCR, dépendances et CI** (P1, préalable à la clôture du gate).
5. **Fermer le gate de distribution Windows : sources/notices et VM clean sur l'artefact final** (P0 release).

Ensuite : fidélité/formulaires/recherche, qualification conversion/OCR, découpage progressif, puis performance. Ne pas lancer une nouvelle fonctionnalité majeure ou la signature cryptographique avant ces stabilisations.

---

## 12. Recommandation immédiate

Le prochain ticket recommandé est :

> Corriger la restauration après réorganisation dans Chromium et Firefox, préserver les enregistrements récupérables et faire passer QA-E2E-010/008 sans affaiblir le scénario.

Raison : c'est le défaut produit directement reproduit qui compromet le plus la confiance dans un éditeur local-first. Les sources originales restent intactes, mais les modifications de session deviennent inaccessibles après reload. Le corriger fournit aussi la base de tests nécessaire au futur découpage de la persistance.

---

## 13. Commandes réellement exécutées

Inspection initiale, depuis la racine :

```powershell
git status --short
git branch --show-current
git log -15 --oneline
```

Inspection : `rg --files` sur architecture/tests/scripts/workflows, `rg -n` sur TODO/FIXME/HACK/skips, appels stockage/export/formulaires/recherche ; `Get-Content -Encoding utf8` des sources, specs, manifestes et documents cités. Comptage des lignes avec `(Get-Content -LiteralPath ...).Count`. Versions : `node --version`, `npm --version`, `uv --version`, `rustc --version`.

Depuis `apps/web` (les quatre vérifications ont été relancées après `npm ci`) :

```powershell
npm ci
npm run test:run
npm run lint
npm run typecheck:e2e
npm run build
npm audit --json
npx playwright test --list
npx playwright install --dry-run
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Resolve-Path ../..) '.playwright-browsers'
npx playwright install chromium firefox
npx playwright test e2e/specs/pdf-search.spec.ts e2e/specs/pdf-forms.spec.ts e2e/specs/print-workflow.spec.ts e2e/specs/persistence.spec.ts e2e/specs/organize-pages.spec.ts --workers=1 --max-failures=3
npx playwright test e2e/specs/pdf-search.spec.ts e2e/specs/pdf-forms.spec.ts e2e/specs/print-workflow.spec.ts e2e/specs/persistence.spec.ts e2e/specs/organize-pages.spec.ts e2e/specs/viewer-modes.spec.ts e2e/specs/save-editing.spec.ts e2e/specs/export.spec.ts --workers=1 --max-failures=6
$env:QA_SKIP_WEBSERVERS='1'
npx playwright test e2e/specs/shape-editing.spec.ts e2e/specs/freehand-controls.spec.ts e2e/specs/comments.spec.ts e2e/specs/text-markup.spec.ts e2e/specs/native-text-editing.spec.ts e2e/specs/text-position-fidelity.spec.ts e2e/specs/zoom-and-scroll.spec.ts --workers=1 --max-failures=5 --reporter=line --output=test-results/audit-secondary
```

Depuis `services/pdf-engine` :

```powershell
uv run pytest
uv run pytest -ra
uv run ruff check .
uv run pytest tests/test_ocr_orientation.py tests/test_ocr_runtime.py -k 'not system_deskew_measurement' -ra
```

Depuis `apps/desktop` : `npm run desktop:check` (tentative avant dépendances web, puis exécution après installation).

Depuis la racine :

```powershell
uv run --project services/pdf-engine python -m scripts.prepare-ocr-resources
ocrmypdf --force-ocr --output-type pdf --optimize 0 --fast-web-view 1000000000 --jobs 1 -l fra+eng apps/web/e2e/fixtures/ocr-oriented-0.pdf data/output/audit-current/ocr-system.pdf
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $PWD '.playwright-browsers'
node data/output/audit-current/probes.cjs
```

Sondes : génération synthétique deux pages par PyMuPDF et relecture des valeurs `form-*.pdf` via Python transmis sur stdin à `uv run --project services/pdf-engine python -`. Les essais initiaux de la sonde ont échoué sur configuration du chemin navigateurs/timing d'ouverture, puis ont été corrigés **dans le script ignoré uniquement**, avant les deux résultats finaux verts. Un essai `python -c` a échoué sur quoting PowerShell, remplacé par stdin.

Serveurs temporaires des sondes/campagne complémentaire : `uv run uvicorn app.main:app --host 127.0.0.1 --port 8000`, et `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort` avec `VITE_PDF_ENGINE_URL=http://127.0.0.1:8000`. Arrêt à la fin de l'audit.

Résultats : sections 5/6. Journaux ignorés sous `data/output/audit-current/` et artefacts Playwright sous `apps/web/test-results/`. Les redirections PowerShell des journaux ajoutent parfois `NativeCommandError` aux lignes stderr de npm ; cela ne doit pas être confondu avec le code de sortie des vérifications. L'interruption initiale du serveur a arrêté une première exécution Python ; seuls les résultats terminés après relance sont comptés. Vérifications finales : `git status --short`, `git diff --stat`, `git diff --check`, `git log -1 --oneline` ; aucun diff suivi. Serveurs propres à l'audit arrêtés par Ctrl+C ; aucun listener restant sur 5173/8000 au contrôle `Get-NetTCPConnection`.

---

## 14. Git final

Worktree vérifié en clôture : `?? PDF_EDITOR_AUDIT.md` uniquement ; aucun fichier suivi modifié.

Modifications réalisées :

- uniquement **`PDF_EDITOR_AUDIT.md`** parmi les fichiers suivis ou à versionner ; aucune correction fonctionnelle ;
- dépendances/venv, caches navigateurs, build Vite/Rust, ressources OCR et preuves/sondes synthétiques générés dans des répertoires ignorés ; aucun fichier personnel consulté, aucun artefact supprimé ;
- aucune modification des lockfiles ou des tests versionnés. L'autorisation utilisateur explicite a permis l'audit dans le dépôt Windows fourni malgré les anciennes restrictions d'environnement `/workspace`.

Commit : **aucun commit**.

Push : **non effectué**.
