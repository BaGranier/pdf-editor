# DESKTOP-005 — validation Windows

Validation du 2026-11-05 dans la VM Windows, avec des PDF synthétiques uniquement.
Les preuves volumineuses restent ignorées sous `data/output/desktop-005/`.
La candidate NSIS MVP-004 existante n'a pas été remplacée.

## Ouvertures natives

- Plugin officiel `tauri-plugin-single-instance` 2.5.5, enregistré avant les autres plugins.
  Cette version attend la fenêtre de transmission lors de lancements concurrents ;
  la version 2.4.5 avait reproduit une course lors du test natif.
- Tauri 2.12.5 / Rust minimum 1.90 : versions requises par ce plugin.
- Une file Rust existe dès le builder : arguments initiaux et callback utilisent
  le même filtre PDF et le cwd de l'invocation. Validation/canonicalisation lors
  de la lecture ; une erreur ne rejette pas les autres fichiers du batch.
- La WebView draine la file toutes les 500 ms après restauration du workspace.
  Aucun événement éphémère n'est nécessaire à sa livraison. Le nom IPC historique
  `get_startup_pdfs` est conservé, mais draine désormais aussi les invocations suivantes.
- Ouverture par dialogue et par file sérialisées dans le même cycle de vie frontend.
  Les chemins canonicalisés retrouvent un identifiant opaque stable, insensible
  à la casse Windows ; le frontend active l'onglet portant cet identifiant.
- Callback : unminimize, show, focus ; aucune création de WebView secondaire.

Contrôle automatique dans la **vraie WebView2 Tauri**, par CDP et Win32 :
trois lancements simultanés à froid donnent une fenêtre principale et trois
documents ; un batch de deux fichiers donne cinq documents, restaure la fenêtre
minimisée et lui rend le premier plan. Chemin relatif, espaces et casse différente
réactivent l'onglet existant. Un chemin invalide n'empêche pas le suivant de s'ouvrir.

Reproduction : `cargo build --locked` dans `apps/desktop/src-tauri`, Vite démarré
sur `127.0.0.1:5173`, puis `node scripts/windows-desktop-polish-qa.cjs` depuis
la racine. `PDF_STUDIO_QA_SCALE=1.25` force le DPR WebView2 pour un second passage.
`PDF_STUDIO_QA_LAUNCH_MODE=batch` teste aussi un lancement unique avec trois PDF.
Le backend de QA est isolé sous `data/output`, via une option réservée aux builds
debug ; le profil WebView2 et les fichiers temporaires le sont également.

Preuves : `native-results.json`, `native-file-menu.png`, `native-zoom-*.png` ;
second passage sous `dpr-1.25/`. Ce second passage simule le DPR et ne qualifie
pas un changement physique du scaling Windows.

## Menus

Cause : Fichier utilisait un positionnement absolu à gauche du trigger, sans
collision avec le viewport. Le CSS le masquait entièrement sous 620 px.
Les palettes utilisaient des dimensions supposées ; l'aide des polices était
ancrée dans un coin plutôt que mesurée depuis son trigger.

`ViewportPopover` mutualise Fichier, couleurs et aide des polices : portal,
mesure réelle, marge de 8 px, clamp horizontal, préférence dessous puis dessus,
hauteur maximale avec scroll interne. ResizeObserver, resize, scroll et visual
viewport recalculent le placement ; le portal reste dans l'élément fullscreen.
Escape restaure le focus, click outside ferme, les menus gèrent flèches/Home/End
et Tab. Les actions de la toolbar reviennent à la ligne dans les fenêtres étroites.

Tests géométriques : 1440×900, 400×500, 600×180, position normale et trigger
déplacé près des bords droit/bas ; contenu surdimensionné en unité.
Contrôle natif : menu de 208 px, bord droit à 1272 pour un viewport de 1280 px.

## Rendu

Le rendu principal utilisait déjà `max(1, DPR)`. À DPR 1 et zoom 50 %, une page
600×800 points produisait donc seulement 300×400 pixels pour 300×400 CSS.
Le problème n'était pas un oubli général du DPR. Le DPR n'était cependant pas
une dépendance React suivie lors d'un changement d'écran/scaling.

Le ratio demandé est désormais `max(DPR, min(2, 1 / zoom))`. Le bitmap conserve
au moins le détail du rendu à 100 % lorsque la page est réduite. Les dimensions
CSS, le viewport PDF.js et les coordonnées des couches fonctionnelles ne changent pas.

| Zoom | Ancien ratio, DPR 1 | Nouveau ratio, DPR 1 | Bitmap, page 600×800 |
|---|---:|---:|---:|
| 50 % | 1 | 2 | 600×800 |
| 67 % | 1 | ≈1,493 | 600×800 |
| 75 % | 1 | ≈1,333 | 600×800 |
| 80 % | 1 | 1,25 | 600×800 |
| 90 % | 1 | ≈1,111 | 600×800 |
| 100 % | 1 | 1 | 600×800 |
| 125 % | 1 | 1 | 750×1000 |
| 150 % | 1 | 1 | 900×1200 |

Le DPR est suivi via matchMedia et resize ; les trois modes partagent le même
renderer. Les miniatures utilisent aussi le helper de dimensions et le suivi
du DPR, sans supersampling supplémentaire. La virtualisation du mode continu
et l'annulation des rendus obsolètes sont conservées.

Budget : maximum 16 millions de pixels et 8192 pixels par côté, y compris pour
les pages inhabituelles ; cette borne peut réduire le ratio demandé. À 50 %,
la fixture utilise 1,92 Mo RGBA par canvas, contre 0,48 Mo auparavant, plus un
canvas temporaire pendant le remplacement. À DPR 2 elle n'alloue rien de plus
qu'avant. Les tests existants de virtualisation, gros PDF et présentation 20 pages passent.

Fixture reproductible : `uv run --project services/pdf-engine python -m
scripts.generate-qa-pdfs --sharpness-only` ; serif/sans-serif 6–16 pt, texte dense,
traits 0,25–1 pt. Aucun document utilisateur n'est versionné.

Captures examinées à taille identique : `before-after-50.png`,
`current-0.5.png`, `current-0.75.png`, `edge-native-matched-50.png`,
`edge-native-matched-75.png`. Le viewer Edge affiche respectivement 37,5 % et
56,25 % pour obtenir les mêmes dimensions CSS que notre zoom 50 % / 75 %
(convention 96/72 du viewer navigateur). Le rendu reste différent dans ses
antialiasings, mais les traits fins sont mieux gradués et le texte réduit
conserve davantage de détail. Une appréciation sur les écrans réels reste utile.

## Vérifications et limites

- Vitest : 365 tests ; build frontend et types E2E passent.
- Rust : 15 tests ; `cargo fmt --check` et `desktop:check` passent.
- E2E : **34 Chromium + 8 Firefox passent** ; navigation, zoom, fit, trois modes, recherche/text layer,
  sélection/markup, formes, formulaires, overlays après resize, multi-documents,
  gros PDF, Save/Export, présentation et scénarios DESKTOP-005.
- Backend ciblé : 15 tests (redistribution et serveur desktop), Ruff passe.
- Native : trois passages de sept contrôles WebView2/Win32, DPR 1 et DPR 1,25 forcé ;
  zooms 50/75/100, resize, recherche et sélection inclus. Le troisième passage
  couvre un lancement unique à froid avec plusieurs fichiers (`cold-batch/`).
- Le loader compilé des nouveaux bindings `webview2-com-sys` 0.39.1 correspond
  octet pour octet au SDK Microsoft 1.0.3800.47. Le gate courant conserve
  le hash du SDK et les notices Rust des nouvelles versions ; preuve ciblée :
  `sdk/verification.json`. Les audits historiques
  restent attachés à leurs anciennes versions.
- Pas de rebuild NSIS/kit de diffusion pour ce ticket : le gate complet devra
  qualifier la nouvelle candidate, notamment les nouveaux composants Rust natifs.
- Explorer réel via association installée (sélection de trois fichiers puis Entrée,
  application fermée puis ouverte, double-clic) et scaling Windows 125 % physique
  restent à valider sur cette nouvelle candidate. Les invocations équivalentes
  de l'exécutable ont été contrôlées, sans modifier l'association installée.

Références : [ordre du plugin Tauri](https://v2.tauri.app/plugin/single-instance/),
[source officielle du SDK des bindings](https://github.com/wravery/webview2-rs/blob/edc2caf886175ccaebe86078c9cfe1ae2a187328/crates/update-bindings/src/main.rs).
