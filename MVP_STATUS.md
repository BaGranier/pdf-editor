# PDF Editor — MVP Status

Dernière mise à jour : 2026-11-02
Version cible : MVP Preview Windows x64 / Tauri

## État

MVP : RELEASE CANDIDATE — **PRÊTE POUR VALIDATION VM CLEAN**.

Dernier gate MVP-004 : `npm run qa:mvp` **exit 0**, commit de build `ae97cb8`, preuves dans `data/output/mvp-gate/latest.json`.

- fonctionnel / redistribution : PASS ; Microsoft CRT / MuPDF / WebView2 : PASS ;
- `release:verify` : PASS ; `qa:mvp` : PASS ; signature Authenticode : hors MVP ;
- VM clean : **À VALIDER MANUELLEMENT**, non exécutée.

- frontend : PASS, 348 tests, types et build ;
- backend : PASS, 270 tests MVP dont les garde-fous CRT/redistribution ; OCR embarqué : 18 tests ciblés PASS ; OCR système `fra` non qualifié ;
- desktop : PASS, checks source/package, 11 tests Rust, NSIS/MSI construits ;
- E2E MVP : PASS, 36 Chromium + 36 Firefox, zéro skip/flaky ; restauration répétée 12/12 ;
- installé Windows : ouverture, Save As/Save, réouverture, OCR eng et politique gros Save PASS sur poste dev (pas VM clean).

Preuves courantes : `data/output/mvp-004/` et `data/output/mvp-gate/latest.json`. MVP-002/003 sont historiques.
Candidate unique : NSIS `0.1.0`, build `ae97cb80115de78c795a9118d484d01ba3e63cd0`, `data/output/mvp-004/PDF Studio Local_0.1.0_x64-setup.exe`.
SHA-256 : `f207904fcb1521c62460c54f98bbf9169d9b245b70a8d73052a1adb28c1bb735`.

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

MVP-004 reconstruit le sidecar et le NSIS ; les anciennes candidates sont historiques.
Le kit lie sources, commit de build, notices, preuves natives et hashes. Une mise à
jour documentaire ultérieure est identifiée séparément et ne peut modifier le code compilé.
Signature Authenticode hors MVP. **VM clean : À VALIDER MANUELLEMENT**.

## Prochains tickets

Action unique : installer **cette candidate MVP-004** sur une VM Windows clean et
effectuer la validation manuelle. Aucun MVP-005 ni chantier fonctionnel.

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
