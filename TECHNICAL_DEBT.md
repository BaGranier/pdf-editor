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

## PDF-PERF-001 — Limites mémoire et exports extrêmes

Les seuils de 50 Mo, 250 pages et huit documents ouverts restent des
avertissements non bloquants. L'extraction de texte natif est désormais bornée à
la page active et le rendu mono-page à deux buffers, mais PDF.js charge encore
les documents en mémoire et IndexedDB les persiste intégralement ; les exports
de plusieurs milliers de pages et les quotas navigateur doivent encore être
mesurés sur les machines cibles. Le warning Vite sur la taille du bundle PDF.js
reste non bloquant.

## BACKEND-TEST-001 — Multipart FastAPI d'intégration

Les validations unitaires du moteur PDF sont couvertes, mais le multipart HTTP
complet n'a pas encore de couverture d'intégration dédiée. Ajouter ce parcours
avec un corpus de PDF synthétique si la dépendance de test correspondante est
acceptée.

## NATIVE-TEXT-002 — Shaping et transformations avancées

L'édition native couvre les spans homogènes horizontaux et les rotations
orthogonales. Le shaping complexe, les matrices arbitraires, les fontes
variables/collections TTC, le subsetting avancé et le regroupement sémantique
de spans en paragraphes restent des évolutions dédiées. Ils ne doivent pas être
contournés par rasterisation, faux style CSS ou remplacement visuel opaque.

## DESKTOP-RELEASE-001 — Packaging et validation de release

Le sidecar FastAPI local est supervisé en développement, mais les installateurs
autonomes ne sont pas encore validés sous Windows, macOS et Linux. Le manifeste
déclare désormais l'association `.pdf`, mais l'ouverture d'un argument ou d'un
double-clic n'est pas encore importée dans React. Les binaires et données OCR
(OCRmyPDF, Tesseract, Ghostscript, QPDF), Save As natif, la signature Windows,
la notarisation macOS et la mise à jour applicative restent à traiter.

Cette dette est durable car elle conditionne une diffusion desktop générale ;
elle est détaillée dans `DESKTOP.md` et priorisée dans `PROJECT_REVIEW.md`.
