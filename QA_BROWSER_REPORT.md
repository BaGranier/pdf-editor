
## 2026-11-16 — FEAT-PDF-REDACTION-STAMPS

Inspection initiale : worktree propre, HEAD `293f064`, branche de travail
`agent/20261116T122234979691Z`. Aucune dépendance applicative ajoutée.

### Résultats exécutés

- Frontend : `npm run test:run -- --maxWorkers=1 --testTimeout=15000` :
  **69 fichiers, 356 tests réussis**. Les premières exécutions avec concurrence
  ont rencontré des délais dépassés ; les deux échecs sauvegarde/présentation ont
  aussi été reproduits dans un worktree au HEAD initial avant la reprise complète verte.
- Backend ciblé : `test_secure_redaction.py`, `test_stamp_export.py`,
  `test_export_organize.py`, `test_editor_export_profiles.py`, `test_shape_export.py`,
  `test_text_markup_export.py`, `test_freehand_export.py` : **110 réussis, 2 ignorés**
  (vérificateurs indépendants optionnels absents). La suite Python intégrale n'a
  pas été exécutée. Avertissements de dépréciation Swig préexistants.
- `npm run lint`, `npm run typecheck:e2e`, `npm run build` : réussis.
  Vite conserve son avertissement de taille de bundle. `uv run ruff check .`
  depuis `services/pdf-engine` : réussi.
- Chromium : **2 scénarios réussis**, dernière exécution après modification du
  scénario : 17,9 s. Deux zones sur deux pages, undo/redo, tampon APPROUVÉ,
  déplacement/redimensionnement/rotation/opacité, persistance/rechargement,
  zoom 50/100/150 %, thèmes clair/sombre, copie exportée et rouverte, contrôle
  Python des pixels et de la sentinelle ; second scénario import PNG/persistance/export.
- Firefox : tentative exécutée, **échec environnemental avant scénario** :
  `libgtk-3.so.0` absent (`Couldn't load XPCOM`). Aucun résultat Firefox vert annoncé.
- Desktop : `npm run desktop:check` exécuté. Configuration, build web et
  **3 tests du serveur desktop réussis**, puis échec environnemental : Cargo absent.
  Compilation Rust, nouveau test natif de protection des sources et Tauri réel non exécutés.
- Charge synthétique backend : 250 pages texte, une zone : **0,112 s**, entrée
  88 257 octets, sortie 77 892 octets. Page 250 lisible et secret de page 1 absent.
  Mesure ponctuelle, sans garantie sur de gros scans ni mesure de mémoire.

### Contenu réel et contrôle visuel

Les copies finales sont rouvertes avec PyMuPDF. Extraction/recherche, objets et
flux décodés, sentinelle brute/hexadécimale, historique incrémental, pixels source
d'image et rendu, dessins vectoriels et texte voisin sont contrôlés. Les tampons
sont du contenu de page et non des annotations masquables. PNG : masque alpha
conservé et opacité graphique contrôlée. OCR invisible synthétique supprimé.
Les refus couvrent annotations/formulaires/signatures, contenu alternatif et noms
PDF encodés, calques, pièces jointes, images partagées/inline/masquées touchées,
PDF illisibles/chiffrés et géométries invalides.

Captures Chromium `pending-dark.png`, `stamp-pending.png`, `exported-copy.png`
inspectées visuellement : zones rouges translucides « En attente » dans le travail,
tampon rouge tourné, puis rectangles noirs opaques dans la copie, voisins lisibles.
Ces artefacts sont locaux et ignorés sous `apps/web/test-results/`.
L'environnement navigateur a nécessité des bibliothèques Linux extraites dans
`.cache/`, une configuration Fontconfig locale et les navigateurs sous
`.playwright-browsers/` ; aucune installation système ni dépendance du projet ajoutée.

Non vérifiés : impression papier, lecteur PDF externe, session desktop Windows,
qualification manuelle exhaustive de tous les outils et modes, souris tactile,
performances sur gros scans. La portée conservatrice et les limites fonctionnelles
sont décrites dans `REDACTION_STAMPS.md` ; aucun anonymiseur global n'est annoncé.
