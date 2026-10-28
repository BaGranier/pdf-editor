# Dette technique

Le gate Windows 006 reste **NOT READY**. La décision AGPL est approuvée ; les
obligations de sources et notices transitives restent ouvertes. Les blockers
P0 actifs sont centralisés dans [NEXT_STEPS.md](NEXT_STEPS.md), sans recopier
la campagne de QA. Le périmètre Preview actif est dans [MVP_STATUS.md](MVP_STATUS.md).
L'ouverture des PDF protégés et la rotation OCR manuelle sont implémentées.
Deskew/orientation automatique et signature cryptographique restent hors MVP.

Ce document recense les travaux structurels identifiés mais volontairement
exclus des tickets de stabilisation fonctionnelle.

## WEB-RESTORE-006 — Restauration navigateur à requalifier

Corrigé par MVP-001 : le PDF est écrit avant publication de son onglet et le
helper QA ferme sa connexion quand le store n'existe pas encore. QA-E2E-008/010
ont passé trois répétitions par navigateur, sans retirer le reload. Une entrée
invalide ne bloque pas les documents valides et reste conservée pour récupération.
Le desktop ne restaure volontairement pas ses sources natives via IndexedDB.

## Orchestration frontend et styles

`apps/web/src/App.tsx` et `App.css` concentrent encore l'orchestration des outils,
dialogues, sauvegarde/export et layout. Les états et traitements OCR/conversion
sont isolés dans `hooks/useDocumentProcessing.ts`, avec entrées explicites
(document source, URL moteur, ouverture du résultat et feedback). Les modules documentaires,
recherche et composants extraits ne suppriment pas ce couplage.

La restauration/persistance est le prochain candidat identifié : effets de
restauration et snapshots restent mêlés au cycle de vie des documents. Extraire
progressivement un domaine à la fois, avec ses styles, sans changement
fonctionnel ni visuel associé. Conserver les tests du domaine et la gate
transverse de [QA_AUTOMATION.md](QA_AUTOMATION.md). Le découpage du bundle et
le poids du worker PDF.js demandent une mesure avant optimisation.

## SHARED-ARCH-001 — Contrats partagés

Le placeholder `packages/shared` a été supprimé : il ne contenait ni package,
ni schéma, ni consommateur. Les contrats restent pour l'instant typés dans leurs
couches respectives.

Un package commun ne devra être recréé que lorsqu'une source de vérité réellement
partageable existe, par exemple un schéma JSON/OpenAPI générant les modèles
TypeScript et Python. Dupliquer manuellement les mêmes types dans un pseudo-package
commun ne résoudrait pas le risque de divergence.

## BUILD-DISK-001 — Artefacts desktop locaux

Les sorties Rust sous `apps/desktop/src-tauri/target` sont ignorées par Git mais
peuvent occuper plusieurs gigaoctets. Pour récupérer cet espace sans modifier les
sources :

```bash
cd apps/desktop/src-tauri
cargo clean
```

Le prochain `cargo check` ou build recompilera les dépendances nécessaires.

## VIEWER-QA-001 — Validation navigateur finale des modes viewer

Les modes Continu, Page unique et Présentation sont fonctionnellement terminés.
Les scénarios Playwright Chromium et Firefox sont désormais exécutables dans le
workspace. Il reste la QA manuelle sur un écran HiDPI et dans la WebView Tauri,
notamment portrait, paysage, fullscreen, sortie `Escape`, navigation clavier et
netteté du texte fin.

Le code ne contient pas de branche Firefox : le canvas PDF.js utilise le même
backing store proportionnel au DPR dans les deux navigateurs.

## IMAGE-MEMORY-004 — Assets et sessions longues

Les nouveaux imports/exports ont des budgets pixels/RGBA/copies et transportent
les binaires hors du champ JSON limité à 1 Mio. Dix instances partagent un asset.
La RAM après plusieurs exports ouverts reste élevée ; le stress natif sur dix
imports ne prouve pas l'absence de fuite GPU ou de références d'historique.
Qualifier vingt assets distincts, plusieurs cycles et la fermeture des documents,
puis vérifier le pruning existant, qui tient compte des documents, undo/redo,
signature en attente et presse-papiers. Les budgets portent sur la session et ne sont pas un seuil de RAM
totale. Le rapport 004 contient les snapshots, sans faux seuil de release.

## PDF-PERF-001 — Limites mémoire et exports extrêmes

Les seuils de 50 Mo, 250 pages et huit documents ouverts restent des
avertissements non bloquants. L'extraction de texte natif est bornée à la page
active, le rendu mono-page à deux buffers et le mode Continu à une fenêtre de
pages visibles avec deux pages de marge. PDF.js charge néanmoins les documents
en mémoire et IndexedDB les persiste intégralement ; les exports de plusieurs
milliers de pages, les quotas navigateur, la RAM/GPU réelle et la WebView native
doivent encore être mesurés sur les machines cibles. Le warning Vite sur la
taille du bundle PDF.js reste non bloquant.

## BACKEND-TEST-001 — Multipart FastAPI d'intégration

Le ticket 004 ajoute le multipart ASGI réel avec images synthétiques de 1,4 à
10,8 Mo, sans nouvelle dépendance majeure. Les exports sont rouverts et inspectés.
Les charges extrêmes et erreurs de transport réelles restent à étendre.

## NATIVE-TEXT-002 — Shaping et transformations avancées

L'édition native couvre les spans homogènes horizontaux et les rotations
orthogonales. Le shaping complexe, les matrices arbitraires, les fontes
variables/collections TTC, le subsetting avancé et le regroupement sémantique
de spans en paragraphes restent des évolutions dédiées. Ils ne doivent pas être
contournés par rasterisation, faux style CSS ou remplacement visuel opaque.

## WINDOWS-NATIVE-QUALIFICATION-002 — Release Windows encore incomplète

La campagne native est détaillée dans
[QA_AUTOMATION.md](QA_AUTOMATION.md), avec l'état actif dans [MVP_STATUS.md](MVP_STATUS.md).
Le crash forcé du shell termine désormais les descendants backend par Job Object,
mais son dossier temporaire peut subsister. Le ticket 004 nettoie au démarrage
les dossiers de plus de 24 h munis d'une lease, seulement si le PID est prouvé
absent ; les dossiers legacy sans lease sont conservés. Restent : DPI natifs variés et
multi-écran, installation MSI avec droits administrateur, WebView2 absent/offline,
impression produite, chemins réseau/OneDrive, association par double-clic et
validation visuelle LibreOffice. Une VM sans outils dev est nécessaire pour
qualifier l'autonomie utilisateur. Le sidecar Windows embarque désormais OCR
MuPDF/Tesseract et les langues eng/fra/osd. Le smoke clean et l'écran 1080×1900
restent ENV (VM inaccessible). L'absence de deskew, la qualité des scans tournés,
les obligations de redistribution de la voie AGPL approuvée et la mémoire
cumulée des images restent à traiter. Le deskew relève des P1, la mémoire
extrême des P2 ; ils ne deviennent pas des P0 de ce gate. La baseline n'est pas
un seuil de release.

## WINDOWS-SAVE-LARGE-006 — Transport d'un export volumineux

Une candidate intermédiaire du gate 006 produisait 25 327 909 octets après
compression d'images répétées. L'API répondait, mais le dialogue Save As natif
n'apparaissait pas et la session restait occupée. La correction de compression
produit désormais des fichiers beaucoup plus petits pour cette scène ; elle ne
qualifie pas le transport IPC d'un autre PDF de taille comparable. Reproduire
avec une fixture synthétique indépendante avant de déclarer ce parcours fermé.
Les preuves restent sous `data/output/release-gate-006/`.

## WINDOWS-PRINT-006 — Dialogue Windows non obtenu

Sur l'installation finale du gate 006 (WebView2 155.0.4283.62), Ctrl+P ouvre
l'aperçu. La CSP bloquait les PDF `blob:` ; sa correction permet leur chargement
et supprime les erreurs observées. L'appel d'impression n'a cependant produit
ni dialogue Windows ni fichier Microsoft Print to PDF : statut `KO`, cause
résiduelle non isolée. Les snapshots des fenêtres de l'application, descendants
et dialogues possédés n'ont pas identifié de dialogue d'impression. Ne pas
confondre le message « dialogue demandé » avec un résultat imprimé. Requalifier
portrait multipage et paysage après correction ; aucune dépendance externe ni
rasterisation de remplacement n'est ajoutée dans ce gate.

## DESKTOP-LINUX-001 — QA native et bundle Linux

Le sidecar FastAPI local est supervisé en développement Linux et le workflow
Open / Save / Save As est borné par des commandes Rust qui conservent les
chemins dans le processus natif. Il reste à qualifier ce workflow par dialogue
interactif et après installation d'un bundle. Le lancement par argument est
implémenté, mais l'association installée, le double-clic et le second lancement
nécessitent une QA native ; il n'existe toujours pas de stratégie single-instance.
Les binaires et données OCR (OCRmyPDF, Tesseract, Ghostscript, QPDF), la QA
HiDPI, l'impression, les gros PDF, la signature Windows, la notarisation macOS
et la mise à jour applicative restent à traiter.

Cette dette est durable car elle conditionne une diffusion desktop générale ;
elle est détaillée dans `DESKTOP.md` ; le périmètre actif est dans `MVP_STATUS.md`.

## Signature cryptographique après le ticket export 003

Les images manuscrites restent des signatures graphiques. L'export AES-256 et
l'aplatissement n'ajoutent pas de signature numérique. Le sous-ticket
[SIGNATURE_NUMERIQUE_004.md](SIGNATURE_NUMERIQUE_004.md) consigne l'audit initial,
la dépendance majeure à autoriser et les preuves de vérification/packaging encore
requises. Les changements partagés du ticket 003 nécessitent une requalification
Windows ; les rapports natifs existants conservent leur portée historique.
