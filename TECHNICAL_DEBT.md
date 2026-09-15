# Dette technique

Ce document recense les travaux structurels identifiés mais volontairement
exclus des tickets de stabilisation fonctionnelle.

## WEB-ARCH-001 — Modulariser l'application frontend

### Constat

- `apps/web/src/App.tsx` approche 4 000 lignes et concentre état, rendu,
  orchestration métier et interactions navigateur.
- `apps/web/src/App.css` dépasse 2 000 lignes et mélange structure globale,
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
Il reste à exécuter leur scénario Playwright dans Chromium et Firefox lorsque
les binaires correspondants sont installés, puis à effectuer une QA manuelle sur
un écran HiDPI. Les contrôles doivent couvrir portrait, paysage, fullscreen,
sortie `Escape`, navigation clavier et netteté du texte fin.

Le code ne contient pas de branche Firefox : le canvas PDF.js utilise le même
backing store proportionnel au DPR dans les deux navigateurs.

## PDF-PERF-001 — Limites mémoire et exports extrêmes

Les seuils de 50 Mo, 250 pages et huit documents ouverts restent des
avertissements non bloquants. PDF.js charge les documents en mémoire et
IndexedDB les persiste intégralement ; les exports de plusieurs milliers de
pages et les quotas navigateur doivent encore être mesurés sur les machines
cibles. Le warning Vite sur la taille du bundle PDF.js reste non bloquant.

## BACKEND-TEST-001 — Multipart FastAPI d'intégration

Les validations unitaires du moteur PDF sont couvertes, mais le multipart HTTP
complet n'a pas encore de couverture d'intégration dédiée. Ajouter ce parcours
avec un corpus de PDF synthétique si la dépendance de test correspondante est
acceptée.
