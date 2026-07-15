# Rapport de campagne navigateur MVP PDF

Ce rapport accompagne [QA_BROWSER_CHECKLIST.md](QA_BROWSER_CHECKLIST.md). Une ligne ne peut être marquée `OK` qu'après une vérification réelle dans le navigateur concerné.

## Métadonnées

| Champ                       | Valeur                                          |
| --------------------------- | ----------------------------------------------- |
| Date de début               | `2026-07-16`                                    |
| Date de fin                 | `2026-07-16`                                    |
| Système                     | `Linux 6.6.87.2-microsoft-standard-WSL2 x86_64` |
| Branche testée              | `main`                                          |
| Commit testé                | `0256126`                                       |
| Chrome ou Chromium, version | `150.0.7871.115`                                |
| Firefox, version            | `152.0.5`                                       |
| Testeur ou testeuse         | `BGranier`                                      |
| Statut global               | `[x] prêt pour OCR avec réserves`               |

## Démarrage propre

Dans deux terminaux distincts :

```bash
cd /workspace/services/pdf-engine
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

```bash
cd /workspace/apps/web
npm run dev -- --host 0.0.0.0
```

Ouvrir `http://localhost:5173`. Avant chaque navigateur, vérifier que les ports `8000` et `5173` ne sont pas déjà utilisés par une ancienne instance. Arrêter les instances obsolètes et recharger la page avant de commencer : un backend stale invalide les résultats d'export.

## Fichiers de test

| Fichier                                           | Usage                                   |
| ------------------------------------------------- | --------------------------------------- |
| `data/input/test-01-simple-1-page.pdf`            | ouverture et export simples             |
| `data/input/test-02-multipage-5-pages.pdf`        | mode Organiser et actions de page       |
| `data/input/test-03-long-20-pages.pdf`            | scroll, miniatures et multi-document    |
| `data/input/test-04-mixed-portrait-landscape.pdf` | rendu d'orientations mixtes             |
| `data/input/test-05-images-and-text.pdf`          | rendu image et texte                    |
| PDF local non privé > 50 Mo / > 250 pages         | validation des avertissements de limite |
| PDF local invalide avec extension `.pdf`          | erreur PDF.js                           |

Ne pas ajouter de fichier privé ou volumineux au dépôt. Les PDF supplémentaires restent locaux et ignorés par Git.

## Légende des résultats

- `OK` : résultat attendu obtenu sans anomalie.
- `KO` : résultat attendu non obtenu ; consigner un bug ci-dessous.
- `NT` : non testé.
- `R` : réussi avec réserve ; expliquer la réserve dans les notes.

## Résultats fonctionnels

| Test                      | Résultat attendu                                                                           | Chrome/Chromium | Firefox | Notes, capture ou identifiant de bug                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------ | --------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Ouverture PDF             | Le PDF apparaît, devient actif et est lisible.                                             | OK              | OK      |                                                                                                                                      |
| Multi-documents           | Les documents restent indépendants ; fermeture actif/non actif sans crash.                 | OK              | OK      |                                                                                                                                      |
| Sidebar                   | Masquage, affichage, noms longs et navigation clavier fonctionnent.                        | KO              | R       | Chromium : navigation clavier de la sidebar absente ou incorrecte (`UX-MVP-001`). Firefox : réserves consignées pendant la campagne. |
| Thème                     | Clair/sombre est appliqué et restauré après reload.                                        | OK              | OK      |                                                                                                                                      |
| Persistance après reload  | Documents, zoom, scroll, sidebar et plan sont restaurés ou une erreur claire est affichée. | OK              | OK      |                                                                                                                                      |
| Zoom boutons              | Les boutons modifient le zoom sans rendu cassé.                                            | OK              | OK      |                                                                                                                                      |
| Zoom Ctrl/Cmd + molette   | Le zoom change sans scroll parasite ni perte de focus.                                     | OK              | OK      |                                                                                                                                      |
| Scroll                    | Scroll vertical et horizontal restent fluides quand zoomé.                                 | OK              | OK      |                                                                                                                                      |
| Navigation clavier        | Flèches, `PageUp`, `PageDown`, `Home` et `End` restent utilisables.                        | R               | R       | `Home` et `End` : `NT` sur le clavier utilisé ; cette limite de matériel ne constitue pas un échec applicatif.                       |
| Passage en mode Organiser | Grille, nombre de pages et indicateur modifié sont cohérents.                              | OK              | R       | Firefox : affichage des pages parfois décalé ; anomalie non reproduite de façon systématique.                                        |
| Déplacement par flèches   | Les actions gauche/droite donnent l'ordre attendu.                                         | OK              | OK      |                                                                                                                                      |
| Drag-and-drop             | Le déplacement natif réordonne exactement la carte visée.                                  | OK              | OK      |                                                                                                                                      |
| Suppression               | La page disparaît du plan ; plan vide protégé et export désactivé.                         | OK              | OK      |                                                                                                                                      |
| Duplication               | La page est ajoutée au bon endroit et le total est mis à jour.                             | OK              | OK      |                                                                                                                                      |
| Rotation                  | La rotation est visible et exportée correctement.                                          | OK              | OK      |                                                                                                                                      |
| Ajout externe             | Les pages sélectionnées sont ajoutées à la fin dans l'ordre croissant.                     | OK              | OK      |                                                                                                                                      |
| Miniatures externes       | Rendu progressif ou fallback lisible, sélection visible.                                   | OK              | OK      | Certaines miniatures externes peuvent dépasser de leur conteneur (`UX-MVP-002`).                                                     |
| Export mono-document      | Téléchargement, succès et nouvel onglet interne en lecture.                                | OK              | OK      |                                                                                                                                      |
| Export multi-documents    | Pages de sources alternées, rotations et duplications sont fidèles au plan.                | OK              | OK      |                                                                                                                                      |
| Export sans `data/output` | Téléchargement seul, sans message de copie.                                                | OK              | OK      |                                                                                                                                      |
| Export avec `data/output` | Copie présente ou avertissement non bloquant ; téléchargement conservé.                    | OK              | OK      |                                                                                                                                      |
| Ouverture PDF exporté     | Le PDF exporté devient actif en mode lecture, sources conservées.                          | OK              | OK      |                                                                                                                                      |
| Reset données locales     | Réinitialisation confirmée, état propre après reload, réouverture possible.                | OK              | OK      |                                                                                                                                      |
| PDF long                  | Pas de crash ; fluidité et avertissement documentés.                                       | OK              | OK      | Ouverture de pdf de 3400 pages, difficulté de son export. Chargement de plus de 50 mo sans difficulté                                |
| PDF invalide              | Message compréhensible ; documents déjà ouverts préservés.                                 | OK              | OK      |                                                                                                                                      |

## Validation des seuils MVP

Les avertissements ne doivent pas bloquer l'ouverture ou l'export.

| Seuil             | Scénario                                                                     | Chrome/Chromium | Firefox | Observation et recommandation                                                                   |
| ----------------- | ---------------------------------------------------------------------------- | --------------- | ------- | ----------------------------------------------------------------------------------------------- |
| > 50 Mo           | Ouvrir un PDF local non privé de plus de 50 Mo.                              | OK              | OK      | Warning visible, puis noter fluidité et persistance.                                            |
| > 250 pages       | Ouvrir un PDF local non privé de plus de 250 pages.                          | OK              | OK      | Warning visible, puis noter rendu, scroll et miniatures. Difficulté d'affichage pour 8000 pages |
| > 8 documents     | Ouvrir neuf PDF, éventuellement les mêmes fichiers sous des noms différents. | OK              | OK      | Warning visible, sans fermeture forcée.                                                         |
| Export volumineux | Exporter un plan assez grand pour produire un PDF volumineux.                | OK              | R       | Téléchargement, ouverture interne et mémoire à relever. Ok pour 8000 et 3000 pages, mais lent.  |

### Recommandation après campagne

- Taille maximale recommandée : `[x] garder 50 Mo  [ ] abaisser à ____ Mo  [ ] augmenter à ____ Mo`
- Pages maximales recommandées : `[x] garder 250  [ ] abaisser à ____  [ ] augmenter à ____`
- Documents ouverts recommandés : `[x] garder 8  [ ] abaisser à ____  [ ] augmenter à ____`
- Justification : ces seuils sont des avertissements prudents, non des limites bloquantes. Des fichiers et des nombres de pages nettement supérieurs ont pu être ouverts ; la dégradation observée apparaît principalement lors des exports extrêmes.

## Mesures mémoire

Relever une valeur approximative dans le gestionnaire de tâches du navigateur ou le moniteur système, avec le navigateur au premier plan. Les valeurs ci-dessous conservent le périmètre non consigné lors de la campagne : il faut préciser manuellement, pour chaque navigateur, s'il s'agit de la mémoire du navigateur entier ou du processus de l'onglet. Elles ne sont comparables qu'à système et version de navigateur égaux.

| Scénario                       | Documents | Taille PDF totale | Pages totales | Chrome/Chromium mémoire | Firefox mémoire | Périmètre de mesure                                                 | Comportement | Statut | Notes                                                                |
| ------------------------------ | --------: | ----------------: | ------------: | ----------------------: | --------------: | ------------------------------------------------------------------- | ------------ | ------ | -------------------------------------------------------------------- |
| 1 petit PDF                    |         1 |        `0.469 Mo` |           `4` |                `200 Mo` |        `850 Mo` | à renseigner manuellement : navigateur entier ou processus d'onglet | fluide       | OK     |                                                                      |
| 2 petits PDF                   |         2 |         `1.45 Mo` |          `25` |                `253 Mo` |        `900 Mo` | à renseigner manuellement : navigateur entier ou processus d'onglet | fluide       | OK     |                                                                      |
| 1 PDF long                     |         1 |           `11 Mo` |         `700` |                `800 Mo` |      `>1000 Mo` | à renseigner manuellement : navigateur entier ou processus d'onglet | fluide       | OK     |                                                                      |
| Plusieurs PDF ouverts          |      `14` |          `>10 Mo` |        `~100` |                `700 Mo` |      `>1000 Mo` | à renseigner manuellement : navigateur entier ou processus d'onglet | fluide       | OK     |                                                                      |
| Export organisé                |         — |                 — |             — |                       — |               — | —                                                                   | —            | NT     | Aucune mesure prise.                                                 |
| Export multi-documents         |         — |                 — |             — |                       — |               — | —                                                                   | —            | NT     | Aucune mesure prise.                                                 |
| Reload à vide (aucun document) |       `0` |            `0 Mo` |           `0` |                `280 Mo` |        `800 Mo` | à renseigner manuellement : navigateur entier ou processus d'onglet | fluide       | NT     | Mesure à vide conservée ; ne valide pas la persistance après reload. |

En cas de `quota IndexedDB`, noter le message affiché, si les documents restent utilisables pour la session, et si « Réinitialiser les données locales » permet de retrouver un état propre.

## Bugs bloquants

Un bug est bloquant s'il empêche lecture, organisation, export, récupération par reset ou validation fiable d'un scénario critique.

| ID    | Navigateur | Scénario | Étapes minimales | Observé                                           | Attendu | Capture ou détail | Statut |
| ----- | ---------- | -------- | ---------------- | ------------------------------------------------- | ------- | ----------------- | ------ |
| AUCUN | —          | —        | —                | Aucun bug bloquant identifié pendant la campagne. | —       | —                 | aucun  |

## Bugs non bloquants

| ID           | Navigateur      | Scénario                              | Étapes minimales                                                                                        | Observé                                                                                                | Attendu                                       | Capture ou détail                                                              | Statut |
| ------------ | --------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------ | ------ |
| PERF-MVP-001 | Les 2           | Export de plusieurs milliers de pages | Exporter un plan de plusieurs milliers de pages.                                                        | Export lent, sans indicateur de progression suffisamment visible.                                      | Export avec progression suffisamment visible. | Navigateur exact non consigné ; dégradation observée sur les exports extrêmes. | ouvert |
| PERF-MVP-002 | Firefox         | Premier export                        | Lancer un premier export ; si celui-ci reste en cours, réinitialiser les données locales puis relancer. | Le premier export peut parfois rester en cours et nécessiter une réinitialisation des données locales. | Export qui se termine sans réinitialisation.  | Problème intermittent : reproduction non systématique.                         | ouvert |
| UX-MVP-001   | Chrome/Chromium | Navigation clavier de la sidebar      | Utiliser la navigation clavier dans la sidebar.                                                         | Navigation absente ou incorrecte.                                                                      | Navigation clavier fonctionnelle.             | Correspond au `KO` de la sidebar Chromium.                                     | ouvert |
| UX-MVP-002   | Les 2           | Miniatures externes                   | Afficher des miniatures de pages externes.                                                              | Certaines miniatures peuvent dépasser de leur conteneur.                                               | Miniatures contenues dans leur conteneur.     | Navigateur exact non consigné.                                                 | ouvert |

## Décision avant OCR

Décision actuelle : **prêt pour OCR avec réserves**.

Ouverture, lecture, organisation et exports standards sont validés ; la persistance et le reset local sont validés ; aucun crash n'a été constaté sur les fichiers de référence ; le PDF invalide est correctement géré. Les réserves non bloquantes concernent Firefox, les exports extrêmes, la navigation clavier de la sidebar et le débordement de miniatures.

| Critère                              | Chrome/Chromium | Firefox | Décision |
| ------------------------------------ | --------------- | ------- | -------- |
| Export mono et multi-document fiable | OK              | R       | requis   |
| Persistance acceptable après reload  | OK              | OK      | requis   |
| Aucun crash avec les PDF de test     | OK              | OK      | requis   |
| Limites mémoire et quota connues     | OK              | OK      | requis   |
| Drag-and-drop acceptable             | OK              | OK      | requis   |
| Reset local fonctionnel              | OK              | OK      | requis   |
| Erreurs compréhensibles              | OK              | OK      | requis   |

Choisir après remplissage :

- `[ ] prêt pour OCR` : tous les critères requis sont `OK`, sans bug bloquant.
- `[x] prêt pour OCR avec réserves` : tous les flux critiques sont `OK` ou `R`, les limites et tickets sont acceptés explicitement.
- `[ ] pas prêt pour OCR` : un critère requis est `KO` ou `NT`, ou un bug bloquant reste ouvert.

Tickets à créer si nécessaire :

1. `QA-MVP-<id>` pour un bug bloquant reproductible, avec navigateur, version, fichier non privé et étapes minimales.
2. `PERF-MVP-<id>` pour dégradation mémoire, lenteur ou quota, avec les mesures ci-dessus et un seuil candidat.
3. `UX-MVP-<id>` pour une erreur utilisateur peu compréhensible ou un comportement non bloquant.
