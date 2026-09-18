# Revue fonctionnelle et technique du projet

> Revue fondée sur l'état du dépôt au 18 septembre 2026. Les statuts ci-dessous
> décrivent le code, les tests et la documentation présents ; ils ne remplacent
> pas une certification d'installateur sur chaque système d'exploitation.

## Résumé exécutif

PDF Studio Local couvre son périmètre local-first principal : ouverture et
persistance locale de PDF, édition d'annotations et d'objets, organisation de
pages, export, recherche texte incrémentale, impression de l'état courant, OCR local et conversion sortante. Le viewer possède les trois
modes prévus et les travaux récents ont borné l'extraction de texte natif à la
page active ainsi que le rendu mono-page à deux buffers au plus.

Les principaux sujets avant une version desktop stable sont le packaging
multi-plateforme des dépendances OCR/conversion, la validation native sur les
trois OS et écrans HiDPI, la maîtrise des documents/exportations extrêmes, et
la modularisation prudente du grand composant frontend. Les fonctions PDF
professionnelles (impression, recherche, formulaires, redaction, signatures
numériques, etc.) ne sont pas implémentées et ne font pas partie du périmètre
déclaré actuel.

## Architecture observée

| Couche | Responsabilité | Preuve |
| --- | --- | --- |
| Web | React/Vite, viewer PDF.js, état d'édition, IndexedDB, export multipart | `apps/web/src/App.tsx`, `apps/web/src/components/PdfViewer.tsx` |
| Desktop | fenêtre Tauri, port loopback dynamique, cycle du sidecar | `apps/desktop/src-tauri`, `DESKTOP.md` |
| Moteur | FastAPI/PyMuPDF : export, texte natif, OCR, conversion | `services/pdf-engine/app/main.py` |
| QA | Vitest, pytest, Playwright, fixtures PDF synthétiques | `apps/web/src/**/*.test.*`, `services/pdf-engine/tests`, `apps/web/e2e` |

## Matrice fonctionnelle

| Domaine | Fonction | État | Preuve | Limitation | Action suggérée |
| --- | --- | --- | --- | --- | --- |
| Fichiers | Ouvrir, onglets, fermer, dirty confirmation | Complet | `App.tsx`, `App.test.tsx`, E2E save/navigation | Les raccourcis Web réservés restent laissés au navigateur | Maintenir les E2E |
| Fichiers | Sauvegarde / Save As | Partiel | `openSaveAsDialog`, export multipart, `README.md` | Le web télécharge ; le vrai choix de destination natif reste à faire | P1 desktop release |
| Fichiers | Restauration locale | Partiel | persistance IndexedDB dans `App.tsx` et tests associés | Limitée par les quotas navigateur | Mesurer et rendre la récupération plus explicite |
| Fichiers | Récents, drag-and-drop d'ouverture | Absent | absence de composant/commande d'ouverture par dépôt après recherche | Non décrit dans le périmètre courant | P3 produit |
| Fichiers | PDF chiffrés / corrompus | Partiel | rejet de chiffrement dans `main.py`, gestion d'erreur PDF.js | Pas de saisie de mot de passe | P2 selon cible produit |
| Viewer | Continu, Page unique, Présentation, navigation | Complet | `PdfViewer.tsx`, `App.tsx`, E2E viewer | QA physique HiDPI/Tauri reste nécessaire | Conserver la campagne QA |
| Viewer | DPR, resize, transition sans flash | Partiel | buffers front/back et tests viewer | Validation native et GPU/HiDPI non reproductible en CI actuelle | P1 QA desktop |
| Viewer | Gros PDF / mémoire | Fragile | warnings de seuil dans `App.tsx`, `TECHNICAL_DEBT.md` | PDF.js et IndexedDB retiennent encore des documents complets | P1 mesures et limites produit |
| Édition | Texte ajouté, signatures, formes, dessin, commentaires, markup | Complet | `PdfEditLayer.tsx`, exports et E2E dédiés | Fidélité dépendante de la police source | Maintenir les tests export |
| Édition | Texte PDF natif | Partiel | `NativeTextLayer.tsx`, API `/pdf/native-text*`, `NATIVE_TEXT_EDITING.md` | Spans homogènes/rotations orthogonales ; shaping/transforms avancés exclus | P2, voir NATIVE-TEXT-002 |
| Édition | Polices intégrées et personnalisées | Partiel | `FontRegistry`, sélecteur/import et export | Collections, variables, shaping et subsets avancés limités | P2 compatibilité et corpus |
| Pages | Rotation, suppression, duplication, réorganisation, ajout depuis PDF ouvert | Complet | `OrganizationPanel.tsx`, `/pdf/export/organize`, E2E | — | Maintenir la couverture |
| Pages | Split/extraction avancée | Hors périmètre | limites explicites `README.md` | Aucune UI dédiée | Ticket produit séparé si requis |
| OCR | OCR local fra/eng/mixte et réouverture | Partiel | `OcrDialog.tsx`, `/ocr`, tests OCR | Dépendances système, qualité et durée variables ; annulation limitée | P1 packaging/feedback |
| Conversion | DOCX, TXT, HTML, PNG, JPEG sortants | Partiel | `/convert`, `CONVERSION.md`, tests backend | DOCX complexe sans fidélité garantie | P2 corpus de fidélité |
| PDF pro | Recherche texte et impression de l'état courant | Complet pour Web / WebView | `pdf/search.ts`, `PdfSearchBar.tsx`, `saving/print.ts`, E2E ciblés | Le dialogue système Tauri reste à valider sur chaque OS | QA release Desktop |
| PDF pro | Formulaires, outlines, pièces jointes, redaction, mots de passe, signature numérique | Absent / hors périmètre | aucune commande/composant/route/test correspondant après recherche ; limites projet dans `AGENTS.md` | Ces fonctions ne sont pas promises par le produit actuel | Décision produit avant implémentation |
| UX | Thèmes, confirmation destructive, erreurs métier | Partiel | `App.tsx`, dialogues, QA | Certains rapports manuels sont historiques | Rafraîchir la QA par release |
| UX | Raccourcis applicatifs | Complet pour le minimum supporté | `commands/appShortcuts.ts`, `App.tsx`, tests associés | `Ctrl/Cmd+W` et tabs réservés au desktop | Documenter les différences |
| Desktop | Sidecar local, health/restart, port dynamique | Complet en développement | `apps/desktop/src-tauri`, `DESKTOP.md` | Validation de release OS non terminée | P1 |
| Desktop | Installateurs, association PDF, ouverture double-clic, signatures/notarisation, mises à jour | Partiel | limites explicites `DESKTOP.md`, `AGENTS.md` | Pas validé pour publication générale | P1 |
| Tests | Unitaires/frontend/backend/E2E | Partiel | Vitest, pytest et 30+ specs E2E | Pas de campagne Tauri automatisée, corpus lourd limité | P1/P2 |
| Sécurité | Traitement local, validation formats, temporaires | Partiel | `CONVERSION.md`, backend | Corpus malveillant et limites subprocess à renforcer | P1 robustesse |

## Points complets dans le périmètre actuel

- workflow local-first, multi-document, état dirty et confirmation de fermeture ;
- viewer et navigation de base, miniatures et organisation de pages ;
- export PDF sans mutation du fichier source ;
- annotations/objets d'édition couverts par le moteur et les suites ciblées ;
- OCR et conversion locale avec erreurs métier documentées ;
- exécution Desktop de développement avec backend loopback supervisé.

## Fonctions partielles ou fragiles

- Les exports et documents très gros restent traités en mémoire : les seuils
  50 Mo, 250 pages et huit documents sont des avertissements, pas des bornes.
- L'édition native de texte refuse explicitement les cas complexes plutôt que de
  promettre une fidélité erronée. C'est le bon comportement, mais le support
  typographique n'est pas général.
- Le rendu Web est couvert par tests ; le chemin Tauri/WebView et les écrans
  HiDPI restent des contrôles manuels de release.
- OCR et DOCX dépendent de logiciels/qualité externes ; `CONVERSION.md` décrit
  les limites mais il manque une validation empaquetée sur chaque OS.
- La restauration IndexedDB est fonctionnelle mais exposée aux quotas et aux
  changements de schéma du navigateur.

## Dette technique et risques

| Priorité | Sujet | Impact / probabilité | Effort | Dépendances |
| --- | --- | --- | --- | --- |
| P0 | Aucun défaut de perte de données confirmé par cette revue | — | — | Maintenir sauvegarde/export et tests |
| P1 | Packaging release Tauri des outils OCR/conversion et validation OS | Élevé / élevé | XL | Windows, macOS, Linux, licences/outils système |
| P1 | Mesures structurées de mémoire/export sur corpus 250+ pages | Élevé / moyen | M | fixtures non privées, instrumentation navigateur |
| P1 | Robustesse des entrées et subprocess (PDF anormal, timeouts, nettoyage) | Élevé / moyen | M | moteur Python, corpus de sécurité |
| P1 | Modularisation progressive de `App.tsx` et `App.css` | Élevé / élevé | XL | tests de non-régression |
| P2 | Corpus de fidélité native text/fonts et DOCX complexes | Moyen / moyen | L | fontes redistribuables, fixtures synthétiques |
| P2 | QA automatisée Desktop et HiDPI | Moyen / moyen | L | runners natifs/WebView |
| P2 | Clarifier les limites IndexedDB, crash recovery et fichier récent | Moyen / moyen | M | décision UX produit |
| P3 | Recherche, impression, formulaires et autres fonctions PDF pro | Variable / produit | L–XL | décision de périmètre |
| P3 | Raccourcis configurables et page d'aide dédiée | Faible / moyen | M | système de préférences futur |

## Tests, QA et documentation

Les suites sont structurées par niveau mais aucune suite ne remplace une QA de
packaging. `QA_BROWSER_REPORT.md` se déclare historique (commit de juillet) et
ne doit pas être lu comme une validation de l'état actuel. Les sources de vérité
opérationnelles sont les tests exécutés et `QA_AUTOMATION.md` ; les constats
manuels doivent être renouvelés pour une release.

La documentation existante est substantielle : `README.md`, `DEVELOPMENT.md`,
`DESKTOP.md`, `CONVERSION.md`, `NATIVE_TEXT_EDITING.md` et les documents QA.
Les écarts principaux sont le besoin d'un protocole de release Desktop et le
suivi des résultats réels par plateforme plutôt qu'un document historique.

## Quick wins et sujets ultérieurs

1. Ajouter un job de smoke test Tauri dès qu'un runner natif est disponible.
2. Publier une matrice de support par OS pour OCR/conversion et l'associer au
   processus d'installation.
3. Créer un corpus synthétique de PDF chiffrés/corrompus et d'exports lourds.
4. Extraire progressivement les domaines de `App.tsx` sans mélanger refactor et
   changements visuels.
5. Décider explicitement si recherche/impression/formulaires font partie de la
   prochaine cible produit avant de créer des raccourcis ou UI associés.
