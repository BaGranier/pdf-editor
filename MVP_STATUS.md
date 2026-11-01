# PDF Editor — MVP Status

Dernière mise à jour : 2026-11-02
Version cible : MVP Preview Windows x64 / Tauri

## État

MVP : RELEASE CANDIDATE — qualification du nouveau NSIS MVP-004 en cours.

Gate : `cd apps/web && npm run qa:mvp` ; résultat courant dans `data/output/mvp-gate/latest.json`. Le nouvel artefact doit être qualifié avant partage.

- frontend : PASS, 348 tests, types et build ;
- backend : périmètre technique MVP-002 PASS (248 tests), complété par les régressions redistribution ; OCR embarqué : 18 tests ciblés PASS ; OCR système `fra` non qualifié ;
- desktop : PASS, checks source/package, 11 tests Rust, NSIS/MSI construits ;
- E2E MVP : PASS, 36 Chromium + 36 Firefox, zéro skip/flaky ; restauration répétée 12/12 ;
- installé Windows : ouverture, Save As/Save, réouverture, OCR eng et politique gros Save PASS sur poste dev (pas VM clean).

Preuves courantes : `data/output/mvp-004/` et `data/output/mvp-gate/latest.json`. MVP-002/003 sont historiques.
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

1. Qualification finale du nouveau NSIS : les contrôles préliminaires confirment trois CRT x64 officiels VC\Redist, version homogène 14.44.35211.0, import/export et démarrage /health vérifiés. Aucun NEEDS_REVIEW de provenance dans l'inventaire préparé. Voir `THIRD_PARTY_NOTICES.md`.

MVP-004 reconstruit le sidecar et le NSIS ; les anciennes candidates sont historiques.
Le kit lie sources, commit de build, notices, preuves natives et hashes. Une mise à
jour documentaire ultérieure est identifiée séparément et ne peut modifier le code compilé.
Signature Authenticode hors MVP. **VM clean : À VALIDER MANUELLEMENT**.

## Prochains tickets

Terminer la qualification du NSIS MVP-004. Après PASS, seule la qualification
manuelle VM clean reste prévue ; aucun MVP-005 ni chantier fonctionnel.

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

- fait : sélection CRT x64 officielle VC\Redist dans le spec, fermeture des imports et garde-fous de provenance ;
- validation : sidecar préliminaire /health et CRT réellement chargées vérifiés, régressions redistribution ; qualification finale du NSIS en cours ;
- décision : app-local conservé, copies System32/CPython supprimées du payload ;
- reste : gates de la nouvelle candidate, puis validation manuelle VM clean uniquement.
