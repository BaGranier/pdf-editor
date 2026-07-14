# Rapport de campagne navigateur MVP PDF

Ce rapport accompagne [QA_BROWSER_CHECKLIST.md](QA_BROWSER_CHECKLIST.md). Une ligne ne peut être marquée `OK` qu'après une vérification réelle dans le navigateur concerné.

## Métadonnées

| Champ | Valeur |
| --- | --- |
| Date de début | `____-__-__` |
| Date de fin | `____-__-__` |
| Système | `à renseigner` |
| Branche testée | `main` |
| Commit testé | `e7f8b6c` à confirmer avec `git rev-parse --short HEAD` |
| Chrome ou Chromium, version | `à renseigner` |
| Firefox, version | `à renseigner` |
| Testeur ou testeuse | `à renseigner` |
| Statut global | `[ ] prêt  [ ] prêt avec réserves  [x] non décidé : campagne non exécutée` |

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

| Fichier | Usage |
| --- | --- |
| `data/input/test-01-simple-1-page.pdf` | ouverture et export simples |
| `data/input/test-02-multipage-5-pages.pdf` | mode Organiser et actions de page |
| `data/input/test-03-long-20-pages.pdf` | scroll, miniatures et multi-document |
| `data/input/test-04-mixed-portrait-landscape.pdf` | rendu d'orientations mixtes |
| `data/input/test-05-images-and-text.pdf` | rendu image et texte |
| PDF local non privé > 50 Mo / > 250 pages | validation des avertissements de limite |
| PDF local invalide avec extension `.pdf` | erreur PDF.js |

Ne pas ajouter de fichier privé ou volumineux au dépôt. Les PDF supplémentaires restent locaux et ignorés par Git.

## Légende des résultats

- `OK` : résultat attendu obtenu sans anomalie.
- `KO` : résultat attendu non obtenu ; consigner un bug ci-dessous.
- `NT` : non testé.
- `R` : réussi avec réserve ; expliquer la réserve dans les notes.

## Résultats fonctionnels

| Test | Résultat attendu | Chrome/Chromium | Firefox | Notes, capture ou identifiant de bug |
| --- | --- | --- | --- | --- |
| Ouverture PDF | Le PDF apparaît, devient actif et est lisible. | NT | NT | |
| Multi-documents | Les documents restent indépendants ; fermeture actif/non actif sans crash. | NT | NT | |
| Sidebar | Masquage, affichage, noms longs et navigation clavier fonctionnent. | NT | NT | |
| Thème | Clair/sombre est appliqué et restauré après reload. | NT | NT | |
| Persistance après reload | Documents, zoom, scroll, sidebar et plan sont restaurés ou une erreur claire est affichée. | NT | NT | |
| Zoom boutons | Les boutons modifient le zoom sans rendu cassé. | NT | NT | |
| Zoom Ctrl/Cmd + molette | Le zoom change sans scroll parasite ni perte de focus. | NT | NT | |
| Scroll | Scroll vertical et horizontal restent fluides quand zoomé. | NT | NT | |
| Navigation clavier | Flèches, `PageUp`, `PageDown`, `Home` et `End` restent utilisables. | NT | NT | |
| Passage en mode Organiser | Grille, nombre de pages et indicateur modifié sont cohérents. | NT | NT | |
| Déplacement par flèches | Les actions gauche/droite donnent l'ordre attendu. | NT | NT | |
| Drag-and-drop | Le déplacement natif réordonne exactement la carte visée. | NT | NT | |
| Suppression | La page disparaît du plan ; plan vide protégé et export désactivé. | NT | NT | |
| Duplication | La page est ajoutée au bon endroit et le total est mis à jour. | NT | NT | |
| Rotation | La rotation est visible et exportée correctement. | NT | NT | |
| Ajout externe | Les pages sélectionnées sont ajoutées à la fin dans l'ordre croissant. | NT | NT | |
| Miniatures externes | Rendu progressif ou fallback lisible, sélection visible. | NT | NT | |
| Export mono-document | Téléchargement, succès et nouvel onglet interne en lecture. | NT | NT | |
| Export multi-documents | Pages de sources alternées, rotations et duplications sont fidèles au plan. | NT | NT | |
| Export sans `data/output` | Téléchargement seul, sans message de copie. | NT | NT | |
| Export avec `data/output` | Copie présente ou avertissement non bloquant ; téléchargement conservé. | NT | NT | |
| Ouverture PDF exporté | Le PDF exporté devient actif en mode lecture, sources conservées. | NT | NT | |
| Reset données locales | Réinitialisation confirmée, état propre après reload, réouverture possible. | NT | NT | |
| PDF long | Pas de crash ; fluidité et avertissement documentés. | NT | NT | |
| PDF invalide | Message compréhensible ; documents déjà ouverts préservés. | NT | NT | |

## Validation des seuils MVP

Les avertissements ne doivent pas bloquer l'ouverture ou l'export.

| Seuil | Scénario | Chrome/Chromium | Firefox | Observation et recommandation |
| --- | --- | --- | --- | --- |
| > 50 Mo | Ouvrir un PDF local non privé de plus de 50 Mo. | NT | NT | Warning visible, puis noter fluidité et persistance. |
| > 250 pages | Ouvrir un PDF local non privé de plus de 250 pages. | NT | NT | Warning visible, puis noter rendu, scroll et miniatures. |
| > 8 documents | Ouvrir neuf PDF, éventuellement les mêmes fichiers sous des noms différents. | NT | NT | Warning visible, sans fermeture forcée. |
| Export volumineux | Exporter un plan assez grand pour produire un PDF volumineux. | NT | NT | Téléchargement, ouverture interne et mémoire à relever. |

### Recommandation après campagne

- Taille maximale recommandée : `[ ] garder 50 Mo  [ ] abaisser à ____ Mo  [ ] augmenter à ____ Mo`
- Pages maximales recommandées : `[ ] garder 250  [ ] abaisser à ____  [ ] augmenter à ____`
- Documents ouverts recommandés : `[ ] garder 8  [ ] abaisser à ____  [ ] augmenter à ____`
- Justification : `à renseigner après mesures`.

## Mesures mémoire

Relever une valeur approximative dans le gestionnaire de tâches du navigateur ou le moniteur système, avec le navigateur au premier plan. Noter aussi l'onglet ou le processus s'il est identifiable. Les valeurs ne sont comparables qu'à système et version de navigateur égaux.

| Scénario | Documents | Taille PDF totale | Pages totales | Chrome/Chromium mémoire | Firefox mémoire | Comportement (`fluide`, `lent`, `très lent`, `crash`, `quota IndexedDB`, `erreur PDF.js`) | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 petit PDF | 1 | `____ Mo` | `____` | `____ Mo` | `____ Mo` | NT | |
| 2 petits PDF | 2 | `____ Mo` | `____` | `____ Mo` | `____ Mo` | NT | |
| 1 PDF long | 1 | `____ Mo` | `____` | `____ Mo` | `____ Mo` | NT | |
| Plusieurs PDF ouverts | `____` | `____ Mo` | `____` | `____ Mo` | `____ Mo` | NT | |
| Export organisé | `____` | `____ Mo` | `____` | `____ Mo` | `____ Mo` | NT | |
| Export multi-documents | `____` | `____ Mo` | `____` | `____ Mo` | `____ Mo` | NT | |
| Reload après persistance | `____` | `____ Mo` | `____` | `____ Mo` | `____ Mo` | NT | |

En cas de `quota IndexedDB`, noter le message affiché, si les documents restent utilisables pour la session, et si « Réinitialiser les données locales » permet de retrouver un état propre.

## Bugs bloquants

Un bug est bloquant s'il empêche lecture, organisation, export, récupération par reset ou validation fiable d'un scénario critique.

| ID | Navigateur | Scénario | Étapes minimales | Observé | Attendu | Capture ou détail | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Aucun à ce stade | - | - | - | Campagne non exécutée | - | - | ouvert |

## Bugs non bloquants

| ID | Navigateur | Scénario | Étapes minimales | Observé | Attendu | Capture ou détail | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Aucun à ce stade | - | - | - | Campagne non exécutée | - | - | ouvert |

## Décision avant OCR

Décision actuelle : **pas prêt pour OCR**, car aucune campagne Chrome/Chromium et Firefox n'est encore consignée.

| Critère | Chrome/Chromium | Firefox | Décision |
| --- | --- | --- | --- |
| Export mono et multi-document fiable | NT | NT | requis |
| Persistance acceptable après reload | NT | NT | requis |
| Aucun crash avec les PDF de test | NT | NT | requis |
| Limites mémoire et quota connues | NT | NT | requis |
| Drag-and-drop acceptable | NT | NT | requis |
| Reset local fonctionnel | NT | NT | requis |
| Erreurs compréhensibles | NT | NT | requis |

Choisir après remplissage :

- `[ ] prêt pour OCR` : tous les critères requis sont `OK`, sans bug bloquant.
- `[ ] prêt pour OCR avec réserves` : tous les flux critiques sont `OK` ou `R`, les limites et tickets sont acceptés explicitement.
- `[x] pas prêt pour OCR` : un critère requis est `KO` ou `NT`, ou un bug bloquant reste ouvert.

Tickets à créer si nécessaire :

1. `QA-MVP-<id>` pour un bug bloquant reproductible, avec navigateur, version, fichier non privé et étapes minimales.
2. `PERF-MVP-<id>` pour dégradation mémoire, lenteur ou quota, avec les mesures ci-dessus et un seuil candidat.
3. `UX-MVP-<id>` pour une erreur utilisateur peu compréhensible ou un comportement non bloquant.
