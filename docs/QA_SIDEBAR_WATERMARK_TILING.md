# FEAT-PDF-SIDEBAR-GROUPS / FEAT-PDF-WATERMARK-TILING

Validation locale du 16 novembre 2026. Aucun push.

## Résultat fonctionnel

La barre gauche passe de 15 boutons permanents à 6 entrées : Sélection,
Édition, Annotations, Marquage, Conversion, Pages. Documents et Fichier restent
en place ; Ctrl+F reste accessible. Le mapping détaillé et les règles UX sont
dans [SIDEBAR_AND_WATERMARKS.md](../SIDEBAR_AND_WATERMARKS.md).

Un état local `openNavigationGroup` pilote le menu temporaire sans toucher à
`activeEditingTool`, au dirty state ou à l’historique PDF. Le parent et le
sous-outil actifs sont identifiés par coche et `aria-pressed`. Les menus ont
`aria-expanded` / `aria-controls`, un focus visible, des flèches clavier,
Home/End, Tab, Escape et fermeture extérieure. Ils sont positionnés dans le
viewport avec défilement interne. Les labels ne sont plus tronqués. Sur petit
écran, l’inspecteur existant devient un panneau superposé refermable.

Le changement d’outil ferme la recherche et la sélection de markup, annule la
création transitoire de dessins et réutilise les propriétés existantes. Un
brouillon de texte natif attend explicitement Valider / Annuler avant de quitter
son mode. Les valeurs de formulaire et les modifications validées restent dans
leur modèle existant. Les raccourcis globaux ignorent les champs éditables ;
Escape dans le champ du filigrane ne ferme plus le compositeur.

Le filigrane Répété étend `StampEdit` : un objet par page, une opération logique
pour un groupe de pages, des coordonnées et espacements en points PDF. La grille
est calculée avec les métriques embarquées, puis tournée et clippée. La rotation
PDF.js de la page est appliquée sans étirement du motif. L’export garde du texte
vectoriel, les transparences et le texte source extractible. Les anciens objets
sans `watermarkMode` conservent leur rendu Unique. L’historique et IndexedDB
conservent tous les paramètres, sans persister une occurrence par inscription.

## Vérifications exécutées

| Commande / campagne | Résultat |
| --- | --- |
| `npm ci` dans `apps/web` | Réussi, aucune dépendance ajoutée au projet |
| `npm run test:run -- --maxWorkers=2` | 76 fichiers, 386 tests réussis |
| `npm run lint` | Réussi |
| `npm run typecheck:e2e` | Réussi |
| `npm run build` | Réussi ; avertissement Vite de chunks > 500 Ko |
| `uv run ruff check .` dans le backend | Réussi |
| `uv run pytest tests/test_watermark_export.py tests/test_stamp_export.py tests/test_secure_redaction.py tests/test_redaction_search.py` | 69 tests réussis |
| `uv run pytest` dans le backend | 447 réussis, 33 ignorés, 4 échecs de conversion OCR : moteur/langue OCR indisponible |
| Playwright `sidebar-tiling.spec.ts search-watermark.spec.ts`, Chromium + Firefox | 16 tests réussis après les dernières corrections Escape et focus en présentation |
| Playwright régression des autres outils, Chromium + Firefox | 22 réussis, 2 ignorés : fixture de virtualisation > 50 Mo absente |
| `npm run desktop:check` | Configuration Tauri, build frontend et 3 tests backend desktop réussis ; arrêt sur Cargo absent |
| `git diff --check` | Réussi |

Les quatre échecs backend concernent deux conversions de corpus scan/mixte et
deux conversions avec OCR automatique. Ils ne concernent pas le filigrane. La
qualification du runtime OCR et de l’application native reste ouverte.

La campagne ciblée utilise :

```bash
cd apps/web
npm exec -- playwright test sidebar-tiling.spec.ts search-watermark.spec.ts
```

La campagne complémentaire utilise `editor-workspace`, `editing-core`,
`comments`, `print-workflow`, `freehand-controls`, `shape-editing`,
`signature-editing`, `native-text-editing`, `multi-document` et `sidebar-tiling`,
avec le filtre :

```text
EDITOR-UX-002|EDIT-CORE-001|EDIT-COMMENTS-001|FORMS-PRINT|EDIT-CONTROLS|EDITOR-UX-003|EDITOR-STAB-001|EDIT-SIGN-001|EDIT-TEXT-NATIVE-001 modifie|VIEWER-CONTINUOUS|sidebar groups
```

Le script `npm run qa:e2e` a préparé les fixtures et le contrôle DOCX, puis s’est
arrêté car cet environnement ne fournit pas `npx`. Les campagnes ont donc été
lancées par `npm exec -- playwright test`, avec les mêmes projets Playwright et
serveurs déclarés dans la configuration du dépôt. Les bibliothèques navigateur,
polices, profils et caches nécessaires au conteneur ont été placés sous
`/workspace/.cache` et `/workspace/.playwright-browsers`. Firefox a nécessité les
variables de désactivation de son sandbox de processus dans ce conteneur ; aucun
réglage de lancement du projet n’a été changé.

## Couverture et limites

Les tests incluent les menus au clavier et à la souris, le thème sombre,
760 × 600, le scrolling interne, le focus, la sélection de sous-outil, la
recherche, les brouillons natifs, le déplacement des motifs et l’historique.
Les tests du filigrane couvrent les anciennes sessions, les formats portrait,
paysage, non standard, la rotation 90°, le CropBox, les coins, les angles signés,
les polices, les textes longs, les caractères refusés, les opacités 0/1, les
limites de densité, le zoom, le DPR 2, le resize, la persistance et l’export rouvert.
Les parcours complémentaires couvrent texte, texte natif, formes, dessin,
déplacement, signature, commentaire, organisation et préparation d’impression.
Le mode présentation est exercé dans le scénario de filigrane historique. Son
entrée donne désormais le focus au lecteur ; le test attend ce focus et vérifie
la sortie effective par Escape, afin d’éviter une course avec le plein écran natif.

Une mesure backend synthétique de 250 pages avec motif Répété produit 23 132
octets en environ 7 à 10 secondes selon la charge locale. Ces pages identiques
bénéficient de la déduplication de ressources : ce chiffre n’est pas une garantie
pour des documents réels. L’E2E 250 pages existant conserve le mode Unique et
vérifie son groupe éditable et son export sur toutes les pages.

Les captures de navigation étroite et du motif sombre ont été examinées. Elles
sont régénérées dans `apps/web/test-results/artifacts` (`compact-menu-dark-narrow`,
`tiled-preview-dark`, `tiled-export-reopened`). Les artefacts de régression sont
sous `data/output/regression-artifacts`. Aucun PDF personnel n’est versionné.

Restent non qualifiés manuellement : application native Windows/macOS/Linux,
impression physique et rendu de la référence personnelle. Les limites du
filigrane sont documentées : Latin-1 sans € ni Œ, graisse normale, premier plan,
portée choisie à la création et application dans les documents sources avant
composition multi-source ou duplication. Aucun moteur de biffage n’a été modifié.
