# FIX-PDF-SIDEBAR-ICONS — SVG de navigation

Correction locale du 19 novembre 2026. Aucun changement métier ni backend.

## Infrastructure et périmètre

Aucune bibliothèque tierce ajoutée : `lucide-react` n’est pas installé. Le
composant SVG `ToolbarIcon` déjà présent dans `App.tsx` est extrait dans
`components/ToolbarIcon.tsx`, puis complété avec les tracés nécessaires. Les
icônes existantes de la toolbar conservent leurs tracés. Aucun chargement réseau,
image matricielle, police d’icônes ou chaîne HTML n’est nécessaire.

Chaque groupe et sous-outil porte une clé `icon` dans `NAVIGATION_GROUPS`.
`ToolbarIconName` contraint les noms acceptés. Tous les dessins emploient
`viewBox="0 0 20 20"`, `fill="none"`, `stroke="currentColor"`, des extrémités
arrondies et une épaisseur 1,7. Les catégories sont affichées à 20 px, les
sous-outils à 18 px et les coches d’état à 12/14 px. Les SVG décoratifs ont
`aria-hidden="true"` et `focusable="false"`.

| Entrée réelle | SVG |
| --- | --- |
| Sélection | `select` : curseur |
| Édition | `pencil` : crayon |
| Annotations | `comment` : bulle de commentaire existante |
| Marquage | `shield` : bouclier avec coche |
| Conversion | `conversion` : flèches d’échange existantes |
| Pages / Lecture | `organize` : pages organisées / `read` : page de lecture |

Les sous-outils utilisent `text`, `edit-text`, `image`, `freehand`, `rectangle`,
`square`, `ellipse`, `circle`, `line`, `arrow`, `comment`, `signature`,
`redaction`, `visual-mask`, `watermark`, `stamp`, `ocr` et `conversion`.
Les coches de parent et de sous-outil utilisent également le SVG `check`.
Il n’existe aucun fallback Unicode dans cette navigation.

Les identifiants, intitulés, tooltips, aria-label, aria-expanded, aria-controls,
callbacks et mécanismes d’ouverture/fermeture restent identiques. Le fond,
la bordure et les coches rendent l’état actif visible sans dépendre de la
couleur seule. Les autres zones de l’application sont hors périmètre.

## Fichiers du correctif

- `apps/web/src/components/ToolbarIcon.tsx` : composant existant partagé, tracés et noms typés.
- `apps/web/src/App.tsx` : import du composant, retrait de sa définition locale uniquement.
- `apps/web/src/components/SidebarNavigation.tsx` : mapping et rendu SVG des catégories, outils et états.
- `apps/web/src/App.css` : dimensions et alignement des icônes, colonne de libellé et descriptions.
- `apps/web/src/components/SidebarNavigation.test.tsx` : contrôle de toutes les icônes, thèmes, états et accessibilité.
- `apps/web/e2e/specs/sidebar-icons.spec.ts` : scénario SVG/états/HiDPI/thèmes/navigation non dirty.
- [Statut MVP](product/MVP_STATUS.md) : journal du ticket.
- Ce rapport.

## Vérifications

Les changements images en cours touchent notamment App, la sidebar, le stockage,
le cycle de vie des documents, la sauvegarde et le shell natif. Pour ne pas les
inclure ni les modifier, le correctif seul est validé dans une copie Git isolée
sous `/workspace/.cache/sidebar-icons-verify`, basée sur `85616ab`. Le commit
contient uniquement le diff SVG vérifié ; les modifications images restent dans
le worktree principal, y compris dans les fichiers partagés.

| Vérification exécutée sur le correctif isolé | Résultat |
| --- | --- |
| `npm run test:run -- --maxWorkers=1` | 76 fichiers, 388 tests réussis |
| `npm run lint` | Réussi |
| `npm run typecheck:e2e` | Réussi après typage du relevé d’état du document |
| `npm run build` | Réussi ; avertissement Vite de chunks > 500 Ko |
| Playwright SVG + navigation groupée, Chromium/Firefox | 6 tests réussis après la dernière modification |
| Playwright parcours existant tampon/recherche/biffage/filigrane/export, Chromium/Firefox | 2 tests réussis |
| `npm run desktop:check:static` | Configuration, build web et 3 tests backend desktop réussis ; Rust/Tauri interactif non exécuté |
| Revue ciblée Unicode, styles et fallbacks | Aucun pictogramme de police restant dans la navigation groupée |
| `git diff --check` | Réussi |

La première exécution complète Vitest avec deux workers et les navigateurs en
parallèle a rencontré de nombreux délais ; elle a été interrompue. La relance
complète avec un seul worker est passée. Le nouveau scénario E2E a aussi corrigé
sa comparaison initiale : les horodatages de persistance sont exclus, les edits
et l’état dirty restent comparés. Une relance a ensuite rencontré l’arrêt d’un serveur Vite partagé sur 5173 ;
la vérification finale utilise des serveurs dédiés sur 5174 (origine déjà autorisée
par le backend) et 8189, avec `QA_BASE_URL`, `QA_BACKEND_URL` et
`QA_SKIP_WEBSERVERS=1`. Les résultats du tableau concernent les relances
vérifiées, sans masquer ces premières tentatives.

Commandes navigateur :

```bash
cd apps/web
npm exec -- playwright test sidebar-icons.spec.ts sidebar-tiling.spec.ts \
  --grep 'sidebar SVG icons|sidebar groups'
npm exec -- playwright test search-watermark.spec.ts \
  --grep 'search redaction watermark'
```

La campagne contrôle Tab, Entrée, flèches, Escape, restitution du focus,
aria-expanded/pressed, les sous-outils Marquage, les panneaux Filigrane/Biffage,
les thèmes clair/sombre, le viewport 760 × 600, le grossissement CSS 125 % et
le DPR 2. Le menu ne crée aucun edit, dirty state ou entrée d’undo. Le parcours
existant vérifie aussi tampon, recherches, zones de biffage, filigrane, zoom,
présentation, historique, persistance, export sécurisé et réouverture.

Les dépendances système nécessaires aux navigateurs ont été extraites sous
`/workspace/.cache`, sans modification système ni dépendance ajoutée au projet.
Le lancement Firefox utilise les variables de sandbox nécessaires au conteneur.
Aucun réglage de lancement du projet n’a changé. Tauri natif interactif n’est pas
qualifié ici : Cargo et l’environnement graphique desktop ne sont pas disponibles.

## Captures et revue visuelle

Captures de documents exclusivement synthétiques, conservées dans les sorties
locales ignorées, non ajoutées aux fixtures. Les vues avant/après ont des DPR et
états de menu différents : comparaison visuelle ciblée, sans prétention à une
différence pixel à pixel.

- [Avant, Chromium : navigation Unicode](../data/output/sidebar-icons/before/sidebar-tiling-sidebar-gro-9b912-on-and-narrow-dark-viewport-chromium/compact-menu-dark-narrow.png)
- [Après, Chromium : Marquage clair](../data/output/sidebar-icons/after/sidebar-icons-sidebar-SVG--a4bb0-s-and-narrow-HiDPI-viewport-chromium/sidebar-svg-light.png)
- [Après, Chromium : Marquage sombre et étroit, DPR 2](../data/output/sidebar-icons/after/sidebar-icons-sidebar-SVG--a4bb0-s-and-narrow-HiDPI-viewport-chromium/sidebar-svg-dark-narrow-hidpi.png)
- [Après, Firefox : Marquage sombre et étroit, DPR 2](../data/output/sidebar-icons/after/sidebar-icons-sidebar-SVG--a4bb0-s-and-narrow-HiDPI-viewport-firefox/sidebar-svg-dark-narrow-hidpi.png)
