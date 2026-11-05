# PDF Editor — MVP Status

Dernière mise à jour : 2026-11-05
Version cible : MVP Preview Windows x64 / Tauri

## État

MVP : RELEASE CANDIDATE — **PRÊTE POUR VALIDATION VM CLEAN**.

- fonctionnel / DESKTOP-005 / single-instance / multi-open Explorer : PASS ;
- menus viewport-safe / netteté faible zoom / scaling Windows 125 % réel : PASS ;
- redistribution / `release:verify` / `qa:mvp` : PASS, exit 0 ;
- frontend : 365 tests, lint, types E2E et build PASS ;
- backend MVP : 272 tests ; OCR embarqué : 18 tests ; Rust : 15 tests PASS ;
- E2E MVP : 40 Chromium + 40 Firefox, zéro skip/flaky ; desktop source/package PASS ;
- installé : Explorer, association PDF, zoom/navigation, Save As/Save, réouverture,
  annotation/signature, OCR eng/fra et plafond Save 25 Mio PASS ;
- VM clean : **À VALIDER MANUELLEMENT**, non exécutée ; signature Authenticode hors MVP.

**FINAL CANDIDATE FOR CLEAN VM : RELEASE-006**, NSIS 0.1.0 Windows x64.
Build : `24dd8a9c7e6e0c060d808a3320bb9b606d86df63`, incluant DESKTOP-005.
Installer : `data/output/release-006/PDF Studio Local_0.1.0_x64-setup.exe`, **59 812 843 octets**.
SHA-256 : `b791da13feab982b07d1f9c203cc6ab58daccb4a2d474e567827323179ce8908`.

Preuves : `data/output/release-006/`, manifest et package verification de cette candidate ;
gate complet : `data/output/mvp-gate/20261105T155837Z/results.json`.
Sources et notices liées au commit : voir [RELEASE_006.md](RELEASE_006.md).
MVP-002, MVP-003 et MVP-004 : **HISTORICAL / DO NOT TEST**, conservés comme preuves.

## Supporté

- Ouverture/navigation, miniatures, zoom, continu/page unique/présentation, multi-documents.
- Éditions de base, undo/redo des éditions, signature graphique, formes, dessin, commentaires/markup.
- Save/Export puis réouverture ; sauvegarde native Preview limitée à **25 Mio par PDF généré**.
- Restauration web après organisation ; une entrée invalide reste conservée sans bloquer les autres.
- Recherche du texte source ; AcroForms standards sur plan source intact.
- OCR eng/fra/mixte du runtime embarqué, rotation manuelle ; conversions avec limites de fidélité.

## WIP / limitations connues

- Impression intégrée expérimentale : exporter/enregistrer puis imprimer dans un lecteur externe.
- Formulaires après organisation : champs/verrou PDF désactivés ; organisation refusée si valeurs/verrous modifiés.
- Texte natif partiel et écarts géométriques connus ; recherche hors texte source non garantie.
- Organisation hors undo/redo des éditions ; OCR/conversion sur la source, hors edits non exportés ; DOCX non pixel-perfect.
- Sources natives desktop limitées à la session, signature cryptographique et auto-update hors MVP.
- Linux/macOS WIP. Preview Windows non signée ; installation sans WebView2 nécessite le réseau.

## Blockers restants

Aucun blocker de préparation MVP. Trois CRT x64 officiels VC\Redist, version
homogène 14.44.35211.0, imports/exports et chargement réel vérifiés. Aucun
NEEDS_REVIEW dans l'inventaire courant. Voir `THIRD_PARTY_NOTICES.md`.

RELEASE-006 reconstruit le sidecar et le NSIS avec DESKTOP-005 ; les anciennes candidates sont historiques.
Le kit lie sources, commit de build, notices, preuves natives et hashes. Une mise à
jour documentaire ultérieure est identifiée séparément et ne peut modifier le code compilé.
Signature Authenticode hors MVP. **VM clean : À VALIDER MANUELLEMENT**.

## Prochaine étape

Validation humaine de **cette candidate RELEASE-006 précise** sur une VM Windows clean.
Aucun autre ticket de préparation MVP requis.

## Journal MVP

### 2026-10-28 — MVP-001

- fait : restauration durable, récupération partielle, protections formulaires et impression WIP ;
- validation : 348 Vitest, 248 backend MVP, 18 OCR ciblés, 72 E2E, 11 Rust ; candidate installée contrôlée ;
- décision : Windows Preview, Save plafonné à 25 Mio, impression externe supportée ;
- reste : MVP-002, clôturer sources/notices de redistribution ; aucune nouvelle fonctionnalité requise.

### 2026-10-28 — MVP-002

- fait : collecte automatisée npm/Rust/native, sources applicatives et tierces, manifest/hash liés au commit ;
- validation : tests anti-faux-PASS du gate ; preuves finales sous `data/output/mvp-002` ;
- décision : NSIS officiel non signé, WebView2 bootstrap réseau ; statut NON PARTAGEABLE conservé ;
- reste : unique dossier de redistribution natif MuPDF/Microsoft ; VM clean à valider manuellement ensuite.

### 2026-10-30 — MVP-003

- fait : provenance wheel/RECORD/runtime MuPDF, 15 composants statiques et sources/notices vérifiés ; loader Microsoft identifié et notices SDK ajoutées aux matériaux externes ;
- validation : collecte reproductible et régressions du gate ; candidate NSIS et archive source inchangées ;
- décision : aucune modification fonctionnelle ; Build Tools seul ne démontre pas les droits du CRT app-local ;
- reste : unique blocker CRT Microsoft ; redistribution maintenue NEEDS_REVIEW, VM clean non exécutée.

### 2026-11-02 — MVP-004

- fait : CRT app-local remplacé par les redistribuables officiels VC\Redist des Build Tools ;
- validation : provenance/hashes/imports, chargement réel, Save/OCR installés, `release:verify` et `qa:mvp` exit 0 ;
- décision : app-local conservé, copies System32/CPython supprimées du payload ;
- reste : validation manuelle de cette candidate sur VM Windows clean uniquement.


### 2026-11-05 — DESKTOP-005

- fait : single-instance, file native unique, multi-PDF et activation des doublons ;
- fait : popovers mesurés/contraints au viewport et rendu faible zoom haute résolution borné ;
- validation : 365 frontend, 15 Rust, 34 Chromium + 8 Firefox et vraie WebView2 (DPR 1 / 1,25 simulé) ;
- décision : plugin 2.5.5 pour sa correction des lancements simultanés, Tauri 2.12.5 et Rust 1.90 ;
- reste : nouvelle candidate/gates, Explorer installé et scaling Windows 125 % physique à valider ; voir `DESKTOP_005_QA.md`.


### 2026-11-05 — RELEASE-006

- fait : candidate reconstruite avec DESKTOP-005, sources/notices et nouveaux hashes liés au build ;
- validation : Explorer multi-PDF, association, popovers et rendu faible zoom qualifiés sur package Windows, 125 % réel inclus ;
- gate : `release:verify` et `qa:mvp` PASS ;
- reste : validation manuelle de cette candidate précise sur VM clean.
