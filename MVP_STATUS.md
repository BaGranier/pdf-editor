# PDF Editor — MVP Status

Dernière mise à jour : 2026-10-28
Version cible : MVP Preview Windows x64 / Tauri

## État

MVP : RELEASE CANDIDATE — **NON PARTAGEABLE** tant que la redistribution n'est pas clôturée.

Dernier gate : `cd apps/web && npm run qa:mvp`, 2026-10-28, code **2** (distribution WIP, aucun FAIL technique).

- frontend : PASS, 348 tests, types et build ;
- backend : PASS, 248 tests MVP ; OCR embarqué : 18 tests ciblés PASS ; OCR système `fra` non qualifié ;
- desktop : PASS, checks source/package, 11 tests Rust, NSIS/MSI construits ;
- E2E MVP : PASS, 36 Chromium + 36 Firefox, zéro skip/flaky ; restauration répétée 12/12 ;
- installé Windows : ouverture, Save As/Save, réouverture, OCR eng et politique gros Save PASS sur poste dev (pas VM clean).

Preuves ignorées : `data/output/mvp-gate/20261028T214325Z/` et `data/output/mvp-001/`.
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

1. **Redistribution** : livrer les sources correspondantes et fermer les notices transitives MuPDF/codecs, Rust/npm et droits CRT contre l'artefact final. Licences application/Python/OCR/fontes incluses et inventoriées ; conformité globale non déclarée.

## Prochains tickets

1. Clôturer la redistribution de l'artefact final, sans élargir le périmètre produit.
2. Qualification Preview sur une autre machine Windows ; VM clean séparée des preuves du poste dev.

## Journal MVP

### 2026-10-28 — MVP-001

- fait : restauration durable, récupération partielle, protections formulaires et impression WIP ;
- validation : 348 Vitest, 248 backend MVP, 18 OCR ciblés, 72 E2E, 11 Rust ; candidate installée contrôlée ;
- décision : Windows Preview, Save plafonné à 25 Mio, impression externe supportée ;
- reste : MVP-002, clôturer sources/notices de redistribution ; aucune nouvelle fonctionnalité requise.
