# PDF Editor — MVP Status

Dernière mise à jour : 2026-11-23
Version cible : MVP Preview Windows x64 / Tauri

## WIN-FINAL-020 — 23 novembre 2026

- NSIS Windows x64 **0.2.0**, reconstruit depuis la branche consolidée et installé sur la VM de développement.
- SAVE-01 fermé pour le défaut WebView2 reproduit sur ce paquet. Le plafond de 25 Mio est vérifié.
- PRINT-01 reste ouvert pour l’impression intégrée. Le parcours Preview passe par l’export puis un lecteur externe.
- VM vierge, bootstrap WebView2 sans runtime et OCR réseau hôte coupé restent à qualifier. Diffusion **NOT READY**.
- [Rapport WIN-FINAL-020](../qa/runs/2026-11-23-win-final-020.md) avec SHA-256, périmètre natif et résultats des suites.

## WIN-RELEASE-003 — 23 novembre 2026

Le NSIS **0.2.1 Windows x64** a été construit et testé sur la VM de développement.
Save As relit les réponses PDF de WebView2 avec le nouveau transport et respecte
le plafond de 25 Mio par PDF généré. La diffusion reste bloquée par les parcours
sur machine vierge, dont l'OCR réseau coupé. L'impression intégrée reste
expérimentale. Voir le [rapport](../qa/runs/2026-11-23-win-release-003.md).

## WIN-RELEASE-002 — 23 novembre 2026

**0.2.0 x64, candidate de diagnostic installée sur VM de développement.**
La diffusion reste bloquée par Save As volumineux et la qualification sur
machine vierge. L'impression intégrée reste ouverte pour la diffusion
générale. Le plafond Preview de 25 Mio s'applique toujours au PDF généré
pour Save.
Voir le [rapport de qualification](../qa/runs/2026-11-23-windows-release-qualification.md) pour l'identité du paquet et les preuves.

## État historique de MVP-004

MVP : RELEASE CANDIDATE — **PRÊTE POUR VALIDATION VM CLEAN**.

Dernier gate MVP-004 : `npm run qa:mvp` **exit 0**, commit de build `ae97cb8`, preuves dans `data/output/mvp-gate/latest.json`.

- fonctionnel / redistribution : PASS ; Microsoft CRT / MuPDF / WebView2 : PASS ;
- `release:verify` : PASS ; `qa:mvp` : PASS ; signature Authenticode : hors MVP ;
- VM clean : **NON VALIDÉ — QA manuelle Windows requise**. Voir le [relevé STAB-2026-11](../qa/runs/2026-11-21-windows-preview.md).

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

La préparation du paquet historique MVP-004 avait franchi ses gates automatisés. Trois CRT x64 officiels VC\Redist, version
homogène 14.44.35211.0, imports/exports et chargement réel vérifiés. Aucun
NEEDS_REVIEW dans l'inventaire courant. Voir les [preuves de redistribution](../architecture/THIRD_PARTY_NOTICES.md).

MVP-004 reconstruit le sidecar et le NSIS ; les anciennes candidates sont historiques.
Le kit lie sources, commit de build, notices, preuves natives et hashes. Une mise à
jour documentaire ultérieure est identifiée séparément et ne peut modifier le code compilé.
Signature Authenticode hors MVP. **VM clean : À VALIDER MANUELLEMENT**.

## Prochains tickets

Pour la candidate 0.2.0, exécuter le gate sur le SHA-256 exact dans une VM
Windows propre. Terminer les parcours P0 partiels du rapport. Le paquet
MVP-004 reste une référence historique.

## Journal MVP

### 2026-11-23 — WIN-RELEASE-003

- Sept Save As installés relus avec texte et rendu identiques. Refus explicite au-delà de 25 Mio.
- Ouvertures natives concurrentes et réactivation du même onglet contrôlées.
- NSIS 0.2.1, provenance et SHA-256 figés sur le commit construit.
- Sortie de l'imprimante PDF vérifiée via un parcours externe scripté. Impression intégrée ouverte.
- VM vierge, bootstrap WebView2 et OCR avec réseau hôte coupé restent à vérifier.

### 2026-11-23 — WIN-RELEASE-002

- NSIS 0.2.0 x64 construit avec le sidecar Windows sur le commit de build identifié.
- Installateur exact testé sur la VM de développement avec SHA-256 mesuré.
- Requêtes redondantes de texte natif et encodage de la fixture filigrane corrigés.
- Save natif nominal et OCR embarqué vérifiés. Save As volumineux échoue dans WebView2, VM propre et impression intégrée ouvertes.
- Matrice, preuves et limites dans le [rapport](../qa/runs/2026-11-23-windows-release-qualification.md).

### 2026-11-21 — STAB-2026-11
- Candidat historique identifié par son commit de build et son hash attendu.
- Artefact et VM Windows propre indisponibles dans le runner Linux.
- Installation Preview et impression native restent à qualifier séparément.
- Matrice de reprise et preuves attendues consignées dans le rapport de qualification.
- Les changements d'interface et de reprise exigent une nouvelle candidate pour diffusion.

### 2026-11-21 — FEAT-PDF-UX-THEMES-NAV-AUDIT
- Six palettes persistées dans les préférences web, avec compatibilité clair/sombre.
- Sept catégories SVG, commandes globales dans l’en-tête et sous-outils accessibles au clavier.
- Placement commun et scroll interne des menus, avec priorité aux fenêtres modales.
- Cartographie, parcours QA et feuille de route produit documentés dans le dépôt.

### 2026-11-20 — FEAT-PDF-LINKS-MULTIPAGE-TOOLTIPS
- Liens HTTP(S), renvois et signets hiérarchiques intégrés à la navigation PDF.
- Création et édition avec historique, puis export de liens PDF natifs.
- Double page et Multipage automatique réutilisent la fenêtre de rendu différé.
- Infobulles et sous-menus repliés dans la fenêtre, avec libellés accessibles et icônes SVG.

### 2026-11-19 — FIX-IMAGE-OPEN-BLANK
- Rectangle blanc reproduit sur un PNG couleur de 640 × 400 dans Chromium et Firefox.
- Masques alpha binaires des PNG convertis encodés en Flate pour PDF.js.
- Taille physique des canvas plafonnée pour préserver le rendu à forte densité ou au zoom.
- Tests de pixels sur le viewer, les miniatures, la restauration, l’export et l’insertion PDF.

### 2026-11-19 — FEAT-PDF-IMAGE-DOCUMENTS
- Ouverture de PNG, JPEG et WebP statiques avec conservation locale des originaux.
- Rotation, miroirs et recadrage visuel du fond avec historique et annotations.
- PDF multipage ordonné, formats A4, Lettre ou image et réglages de cadrage.
- Résultats Chromium, Firefox, backend et limites Desktop dans [le rapport QA](../QA_IMAGE_DOCUMENTS.md).

### 2026-11-19 — FIX-PDF-SIDEBAR-ICONS
- Catégories, sous-outils et coches de navigation passent aux SVG monochromes intégrés.
- ToolbarIcon existant partagé, mapping typé, tailles 20/18 px, aucun ajout de dépendance.
- Libellés, commandes, focus, états actifs et historique PDF conservés.
- Vérification du correctif isolée des ajouts images ; captures et résultats dans [QA Sidebar](../QA_SIDEBAR_ICONS.md).


### 2026-11-16 — FEAT-PDF-WATERMARK-TILING
- Mode Répété ajouté au même filigrane, un objet par page et paramètres en points PDF.
- Aperçu, police embarquée, angle, densité, phase, opacité et export vectoriel synchronisés.
- Anciennes sessions Unique conservées ; historique groupé et persistance réutilisés.
- Géométrie portrait/paysage/rotation/CropBox et limite de densité testées dans les deux runtimes.
- Mesure synthétique 250 pages : 23 132 octets ; durée observée entre 7 et 10 secondes.


### 2026-11-16 — FEAT-PDF-SIDEBAR-GROUPS
- Barre gauche réduite à six entrées ; inventaire centralisé et aucun outil supprimé.
- Biffage, masquage, filigrane et tampon réunis sous Marquage avec explications.
- Menus temporaires accessibles, focus restauré, état de navigation indépendant du PDF.
- Parcours de tests adaptés à la navigation par catégories ; détail dans [Sidebar et filigranes](../features/SIDEBAR_AND_WATERMARKS.md).


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

### 2026-11-16 — FEAT-PDF-REDACTION-STAMPS / biffage
- Zones rectangulaires en attente intégrées au viewer, historique et persistance existants.
- Biffage natif PyMuPDF en dernière étape de contenu ; copie réécrite et nettoyée.
- Refus explicite des structures complexes non qualifiées et des images partagées touchées.
- Qualification synthétique : texte, pixels, vecteurs, rotations/CropBox et historique incrémental.
- Périmètre et limites décrits dans [Biffage et tampons](../features/REDACTION_STAMPS.md) ; aucun push.

### 2026-11-16 — FEAT-PDF-REDACTION-STAMPS / tampons
- Galerie française, texte personnalisé/date figée, import PNG/JPEG local et inspecteur intégrés.
- Texte vectoriel, transparence, rotation et opacité exportés comme contenu imprimable.
- Réutilisation du stockage d'assets, de l'historique et du contrat d'export existants.
- Refus des tampons sur PDF signés ; protection native des sources pour les copies biffées.
- Bibliothèque personnalisée globale et sélection native de biffage restent hors MVP livré.

### 2026-11-16 — Recherche/biffage et marquages : tampons harmonisés
- Style versionné pour les nouveaux tampons : palette liée et fond teinté à 10 %.
- Adaptation aux boîtes réelles des glyphes, centrage visuel, mode manuel conservé.
- Polices embarquées communes au viewer/PDF ; métriques frontend générées et vérifiées.
- Ancien rendu préservé ; conversion explicite, contrôles de couleur/alpha/marge/bordure.
- Tests ciblés : 21 backend et 9 frontend réussis ; aucune dépendance ajoutée.

### 2026-11-16 — Recherche/biffage et marquages : biffage par recherche
- Matcher Ctrl+F mutualisé : casse, mot entier, expressions et portée par page.
- Résultats sélectionnables et confirmation de masse ; création groupée et dédupliquée.
- Géométrie native vérifiée contre l'empreinte des caractères, jamais dérivée du DOM.
- Refus des correspondances ambiguës ; réutilisation du biffage réel final.
- Tests ciblés : 32 backend et 22 frontend réussis, dont OCR/pixels et pages pivotées.


### 2026-11-25 — Filigrane, biffage, commentaires et thèmes

- Aperçu automatique du filigrane unique et répété sur toutes les pages.
- Recherche et sélection de biffage indexées avec OCR local et progression par page.
- Suppression PDF après composition, contrôle des zones et conservation des annotations compatibles hors zone.
- Commentaire ancré au texte sélectionné et palettes personnalisées persistantes.
- Candidate Windows 0.3.0. Recette sur VM propre à consigner séparément.


### 2026-11-25 — Recette expérimentale Windows 0.2.0

- Sélection dans le rail, actions par icône et commentaires ancrés dans l’inspecteur.
- Paramètres du rail pour le thème, les préférences globales et la langue française ou anglaise des parcours concernés.
- Panneau de biffage avec occurrences repliables et conservation du brouillon à la fermeture.
- Reconstruction bornée des pages avec des Form XObjects touchés et des pages partageant leurs ressources.
- Version de recette 0.2.0 et qualification sur VM Windows propre à consigner séparément.
