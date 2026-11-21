# Thèmes, navigation et fenêtres d’outils

## État de référence

Branche `agent/20261121T182557042078Z`, HEAD `7a1bdf0`, worktree propre.
`App.tsx` appliquait déjà `data-theme` à la racine HTML. Les chaînes `light` et
`dark` étaient stockées par `viewerStorage.ts` dans localStorage, avec les
préférences de navigation. Les documents et assets utilisaient IndexedDB v2.
`App.css` combinait des tokens d’interface et des valeurs fixes pour le feedback,
les contrôles et le contenu. Les icônes provenaient de `ToolbarIcon.tsx`, sans
bibliothèque SVG tierce. Les commandes PDF et clavier étaient orchestrées dans
`App.tsx`. La sidebar disposait de noms accessibles, du focus au clavier et
d’un marqueur actif SVG.

Le workspace, le viewer défilant, les miniatures et l’inspecteur redimensionnable
créent des zones de découpe. La sélection des objets et les animations du viewer
ajoutent des couches locales. Le moteur existant de la sidebar portait déjà les
menus dans `body` et les recalait au resize/scroll. Fichier était positionné
dans l’en-tête et masqué à 620 px. Couleurs, aide des polices, cadenas du
formulaire et infobulle de dépassement avaient chacun leur placement. Le shell
Tauri charge la même interface. Son dialogue natif et son facteur d’échelle
restent propres à la WebView et au système.

## Correspondance des accès

| Ancien accès | Nouvelle catégorie | Sous-outils ou accès conservés |
| --- | --- | --- |
| Édition | Texte | Ajouter et modifier le texte natif, propriétés de texte |
| Édition | Formes et images | Image, dessin libre, rectangle, carré, ellipse, cercle, ligne et flèche |
| Annotations | Texte | Lien, également depuis la sélection de texte |
| Annotations | Signature | Ajouter une signature manuscrite ou importée, puis placer et modifier dans la page |
| Annotations et onglet Commentaires | Annotations | Commentaire et liste. Surligner, souligner et barrer depuis la sélection dans le PDF |
| Marquage | Biffage et tampons | Biffer avec recherche dans l’inspecteur, masquage visuel, tampon, filigrane unique ou répété |
| Organiser et panneau des pages | Pages | Miniatures. Organiser ou Revenir à la lecture. Rotation, suppression, duplication, déplacement et composition dans l’organiseur |
| Conversion et Fichier | Conversion | OCR, convertir le PDF, nouveau PDF à partir d’images. L’accès Images est aussi dans Fichier |
| Sélection | Barre supérieure | Sélection d’objets et de texte |
| Barre supérieure, état et raccourcis | Navigation globale | Ouvrir, enregistrer, exporter, imprimer, rechercher, annuler/rétablir, onglets, mode de lecture et zoom |

`navigationGroups.ts` porte les actions et les libellés. Texte, Formes et images,
Biffage et tampons, Signature, Pages, Conversion et Annotations utilisent
respectivement `text`, `shape`, `shield`, `signature`, `organize`, `conversion`
et `comment`. La sélection d’un outil réutilise la transition existante, y
compris le veto d’un brouillon à valider. Les onglets Pages et Commentaires,
les signets, le calque de sélection de texte et les inspecteurs gardent leur
fonction métier.

## Inventaire des fenêtres et politique de placement

| Famille | Accès et traitement |
| --- | --- |
| Sidebar et infobulles | Panneau portalisé, déport latéral et priorité au côté disponible. Bord de fenêtre, retournement, scroll interne, flèches, Début, Fin et focus restauré sur Échap |
| Fichier | Menu portalisé, aligné sur le bouton avec ouverture vers le haut si nécessaire. En-tête multiligne sur fenêtre étroite. Export et impression ouvrent leurs dialogues |
| Palette de couleurs | Ancre dans l’inspecteur ou dans la barre d’annotation contextuelle. La palette et la barre restent manipulables ensemble, puis la sélection restitue le focus |
| Aide des polices | Ancrage au bouton d’aide, contenu et détail dépliable défilables. Les polices et tailles utilisent toujours des contrôles natifs |
| Verrou de formulaire | Popover portalisé depuis la page PDF. Les confirmations disposent d’une couche modale supérieure |
| Barre d’annotation et dépassement de texte | La sélection de texte fournit une plage DOM qui suit le document. Le bloc de texte fournit l’ancre de son infobulle |
| Recherche / rognage | Recherche bornée dans le workspace, message d’erreur dans son flux. Commandes de rognage fixées en bas ou intégrées à leur dialogue |
| Dialogues | Surfaces et backdrop thématisés. Corps défilable si la fenêtre manque de hauteur |
| Sélecteurs et infobulles natifs | Thème, police, profils d’export, formats, options d’OCR, formulaires et autres `select`, couleur système et `title` suivent le navigateur ou l’OS |
| Panneaux intégrés | Signets, commentaires, listes de pages, résultats de biffage et propriétés restent dans leur zone défilante, sans menu contextuel autonome |

Le hook commun relève la fenêtre visuelle et recalcule les coordonnées lors du
défilement, du resize et des changements de dimensions de l’ancre ou du menu.
Les panneaux portalisés héritent de la palette racine. Les libellés utilisent leur
largeur naturelle et passent à la ligne si nécessaire. Une ancre disparue ou
hors champ ferme son popover. Le changement de document ferme les commandes
contextuelles. Les gestes et sélecteurs natifs restent soumis aux comportements
de la plateforme. Le zoom CSS automatisé exerce la mise à l’échelle du layout,
et la qualification des raccourcis de zoom natifs et de la WebView reste manuelle.

## Scénarios à rejouer

- `themes.spec.ts` vérifie les six palettes, le contraste des panneaux et du
  focus, les dialogues, le canvas à l’identique, la restauration et l’ouverture
  d’un autre document. Les captures couvrent Clair, Sombre, Océan et Sable.
- `sidebar-icons.spec.ts`, `sidebar-tiling.spec.ts` et
  `pdf-links-layout-sidebar.spec.ts` vérifient les sous-outils, les SVG, la
  navigation, le brouillon en cours, les états PDF, les fenêtres basses et le DPR 2.
- `floating-overlays.spec.ts` vérifie le rectangle des menus, les commandes
  atteignables après défilement, l’ordre des couches et le retour du focus.
  `pdf-forms.spec.ts` et `text-markup.spec.ts` vérifient les interactions
  métier et la palette imbriquée.

## Validation exécutée

| Contrôle | Exécution |
| --- | --- |
| Référence `7a1bdf0` | 7 tests Vitest de sidebar/placement. Scénarios d’infobulles et de navigation Chromium et Firefox rejoués sur la référence |
| Vitest | `npm run test:run -- --maxWorkers=2 --testTimeout=15000` |
| TypeScript et production | `npm run lint`, `npm run typecheck:e2e`, `npm run build`. Avertissement Vite de taille de bundle |
| Playwright, thèmes et fenêtres | Campagne sur les scénarios listés ci-dessous, 24 Chromium réussis, 23 Firefox réussis au dernier passage. Le renvoi XYZ a atteint la page cible avec un décalage vertical incorrect sur Firefox. Trois relances isolées passent sur la référence et sur la version livrée. Largeurs de 190 à 1920 px, hauteurs de 230 à 1080 px, test de DPR 2 et zoom CSS 100/125/150/200 %. Les cas comprennent plusieurs documents, le lecteur de 250 pages, la présentation, les dialogues et la persistance |
| Playwright, parcours métier | 23 Chromium réussis et 22 Firefox réussis au premier passage. Sur Firefox, QA-CONV-002 a reçu le nom TXT par défaut malgré le nom saisi. Le scénario complet passe en relance isolée sur `7a1bdf0` et sur la version livrée. Cause non isolée |
| Captures revues | Clair, Sombre, Océan et Sable sur Chromium et Firefox. Les références visuelles existantes ont été actualisées pour l’interface |
| Zoom du navigateur | Chromium, réglage natif d’onglet à 100/125/150/200 %. Vérification du DPR, du rectangle de Fichier, de sa dernière commande et du retour du focus. Firefox qualifié par zoom CSS et redimensionnement |
| Qualification native | Session Tauri installée, zoom natif Firefox, écran tactile et lecteur d’écran à vérifier en environnement cible |

Commandes de la campagne principale, depuis `apps/web`, avec Vite et FastAPI
lancés localement sur les ports 5173 et 8000.

```bash
QA_SKIP_WEBSERVERS=1 QA_WORKERS=1 \
  node node_modules/@playwright/test/cli.js test --timeout=90000 \
  --output test-results/final-core floating-overlays.spec.ts themes.spec.ts \
  sidebar-icons.spec.ts pdf-links-layout-sidebar.spec.ts sidebar-tiling.spec.ts \
  pdf-forms.spec.ts text-markup.spec.ts visual-regression.spec.ts \
  application-startup.spec.ts ui-workspace-responsive.spec.ts persistence.spec.ts
```

La campagne métier a sélectionné 23 scénarios par projet avec le même lanceur
et `--output test-results/final-regression`. Elle couvre le clavier, le texte,
les formes, l’insertion et la conversion d’images, la signature, la recherche,
le biffage et ses copies, le changement de document, l’organisation, la
sauvegarde, l’aperçu d’impression, les PDF protégés et la conversion
DOCX/TXT/HTML/PNG. La relance Firefox utilise `--project=firefox conversion.spec.ts
--grep QA-CONV-002`. Les journaux et captures de ce workspace sont ignorés par Git.

Bibliothèques et polices Linux extraites dans `.uv-cache` et moteurs Playwright
dans `.playwright-browsers`. Firefox headless a nécessité
`MOZ_DISABLE_CONTENT_SANDBOX=1` pour contourner un refus `chroot` dans le
conteneur de QA. Cette variable est limitée aux exécutions locales du
navigateur. Le contrôle natif Chromium a utilisé une extension temporaire
locale pour appliquer et relire le zoom de l’onglet.
