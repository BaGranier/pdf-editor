# Dette technique

Ce document recense les travaux structurels identifiés mais volontairement
exclus des tickets de stabilisation fonctionnelle.

## WEB-ARCH-001 — Modulariser l'application frontend

### Constat

- `apps/web/src/App.tsx` dépasse désormais 5 600 lignes et concentre état, rendu,
  orchestration métier et interactions navigateur.
- `apps/web/src/App.css` dépasse 3 500 lignes et mélange structure globale,
  composants, modes d'édition, dialogues et adaptations responsive.
- cette concentration augmente le coût des revues, le risque de régression et
  la difficulté des tests ciblés.

### Découpage proposé

Créer des tickets indépendants, avec tests inchangés ou renforcés, pour extraire
progressivement :

1. la gestion du cycle de vie et de la persistance des documents ;
2. la sidebar, la navigation et la toolbar ;
3. la sauvegarde, l'export et les noms de destination ;
4. les parcours OCR et conversion ;
5. l'organisation, les miniatures et les actions de pages ;
6. l'édition de texte et de signatures ;
7. les dialogues et messages d'état ;
8. le bootstrap et les diagnostics desktop.

Le CSS devra suivre les mêmes frontières, avec une feuille ou un module par
domaine. Aucun changement visuel ou fonctionnel ne doit être mélangé à ces
extractions.

### Hors du ticket STAB-REPO-001

Le refactoring, le code splitting et l'optimisation du bundle feront l'objet de
tickets séparés après établissement d'une référence QA fiable.

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
[WINDOWS_NATIVE_QUALIFICATION_002.md](WINDOWS_NATIVE_QUALIFICATION_002.md).
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
le statut AGPL/licence commerciale et la mémoire cumulée des images restent à
traiter avant diffusion générale. La baseline n'est pas un seuil de release.

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
elle est détaillée dans `DESKTOP.md` et priorisée dans `PROJECT_REVIEW.md`.

## Signature cryptographique après le ticket export 003

Les images manuscrites restent des signatures graphiques. L'export AES-256 et
l'aplatissement n'ajoutent pas de signature numérique. Le sous-ticket
[SIGNATURE_NUMERIQUE_004.md](SIGNATURE_NUMERIQUE_004.md) consigne l'audit initial,
la dépendance majeure à autoriser et les preuves de vérification/packaging encore
requises. Les changements partagés du ticket 003 nécessitent une requalification
Windows ; les rapports natifs existants conservent leur portée historique.
