# PDF Editor — MVP Status

Dernière mise à jour : 2026-10-30
Version cible : MVP Preview Windows x64 / Tauri

## État

MVP : RELEASE CANDIDATE — **NON PARTAGEABLE** : droits CRT app-local non établis.

Gate : `cd apps/web && npm run qa:mvp` ; résultat courant dans `data/output/mvp-gate/latest.json`. Distribution attendue : code **2** tant que les droits CRT restent non établis.

- frontend : PASS, 348 tests, types et build ;
- backend : périmètre technique MVP-002 PASS (248 tests), complété par les régressions redistribution ; OCR embarqué : 18 tests ciblés PASS ; OCR système `fra` non qualifié ;
- desktop : PASS, checks source/package, 11 tests Rust, NSIS/MSI construits ;
- E2E MVP : PASS, 36 Chromium + 36 Firefox, zéro skip/flaky ; restauration répétée 12/12 ;
- installé Windows : ouverture, Save As/Save, réouverture, OCR eng et politique gros Save PASS sur poste dev (pas VM clean).

Preuves : `data/output/mvp-gate/latest.json`, `data/output/mvp-002/` et revue native `data/output/mvp-003/`.
Candidate NSIS locale : `apps/desktop/src-tauri/target/release/bundle/nsis/PDF Studio Local_0.1.0_x64-setup.exe`.

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

1. **Microsoft CRT app-local — NEEDS_REVIEW** : `MSVCP140.dll` 14.51 vient de System32 ; les deux `VCRUNTIME` 14.38 viennent de Python. Le propriétaire déclare Build Tools uniquement. Obtenir un fondement Microsoft applicable à leur redistribution. MuPDF et le loader SDK sont désormais reliés aux sources/notices. Voir `THIRD_PARTY_NOTICES.md`.

Candidate et sources MVP-002 conservées sans rebuild. Revue externe MVP-003 :
inventaire, notices SDK et manifest séparant commit de build et commit de revue.
`release:verify` reste à 2 tant que le CRT est ouvert. Signature Authenticode hors MVP.
**VM clean : À VALIDER MANUELLEMENT** après clôture de ce droit de redistribution.

## Prochains tickets

Action restante unique : consigner le droit Microsoft applicable au CRT identifié,
puis rejouer le gate. Après PASS, seule la qualification manuelle VM clean reste prévue.

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
