# WEB-ARCH-000 — Baseline QA du refactoring frontend

Cette baseline fixe les contrôles à conserver pendant la modularisation de
`App.tsx` et `App.css`. Elle ne modifie aucun comportement et ne remplace pas la
campagne détaillée décrite dans `QA_AUTOMATION.md`.

## Référence mesurée

- Date : 2026-09-05 (UTC)
- Branche : `main`
- Commit de base : `aca8ed11da4884340c9d8cb332c2d063be601868`
- État testé : worktree modifié
- Empreinte QA de l'état au démarrage de la campagne complète :
  `f53bdbe728f21f526f7dac5e9a9a3fc1ce3355575a8f2939c93fd4257b182a68`
- Taille initiale : `App.tsx` 3 988 lignes ; `App.css` 2 105 lignes
- Environnement : Node 22.23.2, npm 10.9.8, Python 3.11.2, uv 0.12.9
- Navigateurs : Chromium 151.0.7922.34 et Firefox 153.0 fournis par
  Playwright 1.62.0

L'empreinte provient du rapport généré par `npm run qa:e2e`. Le worktree était
déjà modifié avant l'établissement de cette baseline : le commit seul ne suffit
donc pas à reconstruire exactement l'état mesuré. L'empreinte précède aussi la
mise à jour finale de ce document. Une campagne publiée après commit doit
produire sa propre empreinte.

## Commandes réellement disponibles

Depuis `apps/web` :

```bash
npm test -- --run
npm run lint
npm run build
npm run typecheck:e2e
npm run qa:e2e:quick
npm run qa:e2e
```

Il n'existe pas de script `test:e2e`. La campagne navigateur est exposée par
`qa:e2e`; sa variante `qa:e2e:quick` exclut seulement les scénarios marqués
`@slow`.

Depuis `services/pdf-engine` :

```bash
uv run pytest
uv run ruff check .
```

Depuis `apps/desktop` :

```bash
npm run desktop:check
```

## Résultats de la baseline

| Contrôle | Résultat | Détail |
| --- | --- | --- |
| Tests frontend | Réussi | 18 fichiers, 171 tests |
| TypeScript frontend (`lint`) | Réussi | aucune erreur |
| Build frontend | Réussi avec avertissement | build produit ; chunk applicatif de 778,69 kB et worker PDF de 2 222,99 kB avant gzip |
| TypeScript E2E | Réussi | aucune erreur |
| Playwright rapide | Réussi | 66/66 scénarios, Chromium et Firefox, 5,9 min |
| Playwright complet | Réussi avec réserves | 74/74 scénarios, Chromium et Firefox, 4,8 min |
| Régression visuelle DOCX | Réussi | pagination, rendu éditable et visuel validés |
| Tests backend | Réussi | 198 tests réussis, 2 ignorés |
| Ruff backend | Réussi | aucune erreur |
| Contrôle desktop | Incomplet | build web et 2 tests Python réussis ; Cargo absent, contrôle Rust non exécuté |

L'avertissement de taille du build est connu et relève de `WEB-PERF-001`; il ne
bloque pas cette migration. La suite backend complète nécessite que LibreOffice
puisse lancer un processus headless. Dans un sandbox qui l'interdit, le test
`test_docx_corteva_regression.py` échoue avec un code 1 sans sortie ; la même
suite exécutée avec les permissions de processus normales est verte.

La décision automatisée de la campagne complète est « réussite avec réserves » :
les 74 scénarios sont réussis, mais le rapport conserve les contrôles manuels et
les constats d'accessibilité non bloquants comme réserves. Les scénarios lents de
robustesse, OCR automatique sur scan et régression visuelle ont bien été inclus.

## Parcours sentinelles

| Domaine | Scénarios E2E de référence |
| --- | --- |
| Démarrage | `QA-E2E-001` |
| Ouverture PDF et erreur de fichier | `QA-E2E-002`, `QA-E2E-014` |
| Robustesse documents | `QA-E2E-015`, `QA-E2E-016` |
| Navigation documents et pages | `QA-E2E-003`, `QA-E2E-004`, `QA-E2E-006`, `QA-E2E-007` |
| Persistance et rechargement | `QA-E2E-008`, `QA-E2E-009`, `QA-E2E-017` |
| Sauvegarde et Enregistrer sous | les trois scénarios `EDIT-SAVE-001` |
| Export mono/multi-document | `QA-E2E-012`, `QA-E2E-013`, `EDIT-CORE-001` |
| Organisation des pages | `QA-E2E-010`, `QA-E2E-011` |
| Édition de texte | `EDIT-TEXT-001`, `EDIT-INTERACT-001`, `EDIT-TEXT-OVERFLOW-001`, `EDIT-TEXT-FIDELITY-001` |
| Signature | `EDIT-SIGN-001`, `EDIT-CORE-001` |
| OCR | `QA-OCR-001` |
| Conversion | `QA-CONV-001` à `QA-CONV-005`, `QA-CONV-DOCX-002`, `QA-CONV-DOCX-003` |
| Régression visuelle | `QA-E2E-018` |
| Accessibilité et focus | `QA-E2E-019` |

La campagne rapide signale un constat non bloquant déjà présent : le contraste
du contrôle d'ouverture en thème sombre est mesuré à 2,41:1 dans les deux
navigateurs.

## Gate pour chaque extraction

Chaque sous-ticket de modularisation doit au minimum exécuter :

```bash
cd apps/web
npm test -- --run
npm run lint
npm run build
npm run typecheck:e2e
```

Il doit ensuite rejouer, dans Chromium et Firefox, les scénarios sentinelles du
domaine déplacé. `npm run qa:e2e:quick` constitue la validation navigateur
transverse avant fusion. `npm run qa:e2e` reste la gate complète avant la
clôture du ticket parent et après tout déplacement CSS transversal.

Exécuter aussi `uv run pytest` lorsque l'extraction touche les parcours export,
OCR ou conversion, même si le contrat backend reste inchangé. Pour
`WEB-ARCH-009`, installer Rust >= 1.88 puis obtenir un
`npm run desktop:check` entièrement vert.

## Décision

La baseline web et backend est suffisamment stable pour commencer les
extractions structurelles. Les réserves sont explicites : l'état mesuré n'était
pas un worktree propre et la toolchain Rust manque pour valider le desktop.
Aucune de ces réserves ne doit être interprétée comme une autorisation à modifier
le comportement pendant les sous-tickets de refactoring.
