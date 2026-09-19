# Revue fonctionnelle et technique du projet

> État observé le 19 septembre 2026. Cette revue s'appuie sur le code suivi,
> les tests versionnés et la documentation du dépôt ; elle ne constitue pas une
> certification d'installateur ou de matériel qui n'a pas été exécutée.

## Résumé exécutif

PDF Studio Local couvre le socle local-first : ouverture et persistance locale,
multi-document, viewer, organisation de pages, édition d'objets, export, OCR et
conversion. Les développements récents ont aussi apporté la recherche PDF
incrémentale, une impression depuis l'état courant avec aperçu interne, et une
première prise en charge des AcroForms standards.

Les fonctionnalités de recherche, impression et formulaire sont réelles et
testées, mais restent **partielles** au sens produit : elles ont des limites
documentées et aucune campagne de release native complète ne les valide encore
sur Windows, macOS et Linux. La stabilisation a ajouté un scénario Chromium
reproductible de 250 pages / 53,5 Mio et une libération explicite des ressources
PDF.js à la fermeture, ainsi que des régressions backend pour PDF OCR malformés
et chiffrés. Les risques prioritaires restent le packaging Desktop, la mesure
de la mémoire totale sur les machines cibles, la couverture plus large des
entrées/processus externes et la taille de `App.tsx` / `App.css`.

## Architecture observée

| Couche | Responsabilité | Preuve |
| --- | --- | --- |
| Web | React/Vite, viewer PDF.js, état d'édition, IndexedDB, export multipart | `apps/web/src/App.tsx`, `apps/web/src/components/PdfViewer.tsx` |
| Desktop | fenêtre Tauri, port loopback dynamique, cycle du sidecar | `apps/desktop/src-tauri`, `DESKTOP.md` |
| Moteur | FastAPI/PyMuPDF/pypdf : export, texte natif, OCR, conversion, valeurs AcroForm | `services/pdf-engine/app/main.py` |
| QA | Vitest, pytest, Playwright et fixtures synthétiques | `apps/web/src/**/*.test.*`, `services/pdf-engine/tests`, `apps/web/e2e` |
| CI backend | `uv` verrouillé et toolchain OCR Ubuntu 24.04 | `.github/workflows/ci.yml` |

## Matrice fonctionnelle

| Domaine | Fonction | État | Preuve | Limitation | Action suggérée |
| --- | --- | --- | --- | --- | --- |
| Fichiers | Ouvrir, onglets, fermer, dirty confirmation | Complet | `App.tsx`, `App.test.tsx`, E2E save/navigation | Les raccourcis Web réservés restent laissés au navigateur | Maintenir les E2E |
| Fichiers | Sauvegarde / Save As | Partiel | export multipart, `SaveAsDialog.tsx`, tests save/export | Le Web télécharge ; aucun adaptateur de destination native Tauri n'est livré | P1 release Desktop |
| Fichiers | Restauration locale | Partiel | IndexedDB dans `App.tsx`, `viewerStorage.test.ts`, E2E persistence | Quotas et récupération après crash non qualifiés sur les navigateurs cibles | P2 UX / limites produit |
| Fichiers | Récents, drag-and-drop d'ouverture | Absent | aucun composant, commande ni scénario dédié trouvé | Hors périmètre actuellement documenté | P3 si besoin produit |
| Fichiers | PDF chiffrés / corrompus | Partiel | validation backend, `pdf-opening.spec.ts`, `CONVERSION.md` | Pas de saisie de mot de passe | P2 selon cible produit |
| Viewer | Continu, Page unique, Présentation, navigation | Complet | `App.tsx`, `viewer-modes.spec.ts`, `QA_AUTOMATION.md` | Validation physique Tauri/HiDPI séparée | Maintenir la campagne Web |
| Viewer | DPR, resize et transition front/back | Partiel | `viewer/rendering.test.ts`, `viewer-page-transition.spec.ts`, `ui-workspace-responsive.spec.ts` | GPU, WebView Tauri et HiDPI réels non couverts automatiquement | P1 QA Desktop |
| Viewer | Gros PDF / mémoire | Fragile | `pdf/documentLifecycle.ts` libère cache texte, ressources PDF.js et worker ; `QA-E2E-015` ouvre/navigue/ferme 250 pages et 53,5 Mio dans Chromium | PDF.js et IndexedDB matérialisent toujours le document complet ; aucune mesure fiable de RAM totale, GPU ou WebView/Firefox | P1 profiler sur machines cibles et limites produit |
| Édition | Texte ajouté, signatures, formes, dessin, commentaires, markup | Complet | couches d'édition, exports et E2E dédiés | Fidélité dépendante de la police source | Maintenir les tests export |
| Édition | Texte PDF natif | Partiel | `NativeTextLayer.tsx`, API `/pdf/native-text*`, `NATIVE_TEXT_EDITING.md` | Spans homogènes/rotations orthogonales ; shaping et transforms avancés exclus | P2 `NATIVE-TEXT-002` |
| Édition | Polices intégrées et personnalisées | Partiel | `FontRegistry`, import/sélecteur, diagnostics et export | Collections, variables, shaping et subsets avancés limités | P2 corpus de compatibilité |
| Pages | Rotation, suppression, duplication, réorganisation, ajout depuis PDF ouvert | Complet | `OrganizationPanel.tsx`, `/pdf/export/organize`, E2E | — | Maintenir la couverture |
| Pages | Split/extraction avancée | Hors périmètre | limites explicites `README.md`, absence d'UI dédiée | Aucune action autonome | Ticket produit si requis |
| Recherche | Ctrl/Cmd+F, scan incrémental multi-page, navigation et highlights | Partiel | `pdf/search.ts`, `PdfSearchBar.tsx`, `searchGeometry.test.ts`, `pdf-search.spec.ts` | Scan séquentiel sans index persistant ; pas de QA lourd/native exhaustive | P2 corpus 250+ pages et Tauri |
| Impression | Aperçu interne et impression de l'état courant | Partiel | `PrintPreviewDialog.tsx`, `saving/print.ts`, tests unitaires et `print-workflow.spec.ts` | Dialogue système/WebView non automatisable et non validé par OS ; fallback par nouvel onglet seulement à la demande | P1 QA release Desktop |
| Formulaires | Détection et édition AcroForm page-scoped | Partiel | `/pdf/forms`, `PdfFormLayer.tsx`, `test_forms.py`, `pdf-forms.spec.ts` | XFA absent ; seuls texte, multiline, checkbox, radio, combo et list sont ciblés | P2 élargir le corpus de widgets |
| Formulaires | Valeurs, checkbox/radio et sauvegarde sans flatten | Partiel | `_apply_form_values_to_writer`, `test_forms.py` vérifie `/V`, `/AS` et réouverture | Valeurs et verrou refusés après réorganisation des pages ; validation lecteurs tiers non versionnée | P2 conservation structurelle / QA lecteurs |
| Formulaires | Verrou local et verrou ReadOnly PDF | Partiel | `FormLockToolbar.tsx`, `PdfFormLockEdit`, `_apply_acroform_read_only_lock`, tests état/forms/E2E | ReadOnly n'est pas une protection cryptographique ; pas d'aplatissement ; validation externe manuelle restante | P2 documenter la compatibilité lecteurs |
| Formulaires | Rendu readonly sans double valeur | Partiel | `PdfFormLayer.tsx`, `PdfFormLayer.test.tsx`, scénario `FORM-READONLY-RENDER-001` | Le canvas est l'unique rendu visuel des widgets readonly connus ; apparences AcroForm exotiques restent à qualifier | P2 corpus d'apparences non standard |
| OCR | OCR local fra/eng/mixte et réouverture | Partiel | `OcrDialog.tsx`, `/ocr`, `tests/test_ocr.py`, E2E OCR ; limites de taille/pages, timeout et nettoyage dans `app/ocr.py` | Qualité/durée dépendent des binaires et du scan ; packaging OS incomplet | P1 packaging et feedback |
| Conversion | DOCX, TXT, HTML, PNG, JPEG sortants | Partiel | `/convert`, `CONVERSION.md`, tests backend/E2E | DOCX complexe sans fidélité garantie | P2 corpus de fidélité |
| CI backend | Tests OCR et Ruff sur runtime Ubuntu supporté | Partiel | `.github/workflows/ci.yml` installe et vérifie Tesseract `eng`, OCRmyPDF, Ghostscript et QPDF avant `uv sync --locked`, pytest et Ruff ; suite locale : 252 passés, 2 ignorés | La configuration est bornée à Ubuntu 24.04 ; un rapport d'exécution GitHub Actions récent n'est pas versionné | P2 conserver un suivi de run CI, pas de contournement des tests OCR |
| PDF pro | Outlines, pièces jointes, redaction, mots de passe, signature numérique | Hors périmètre | aucune commande/composant/route/test correspondant ; limites dans `AGENTS.md` | Ces fonctions ne sont pas promises actuellement | Décision produit avant implémentation |
| UX | Thèmes, confirmations, erreurs métier et raccourcis minimums | Partiel | `commands/appShortcuts.ts`, dialogues, tests unitaires/E2E | Rapports manuels historiques ; raccourcis réservés navigateur volontairement absents | Rafraîchir QA à chaque release |
| Desktop | Sidecar, health/restart et port dynamique en développement | Complet | `apps/desktop/src-tauri`, `DESKTOP.md`, tests du lanceur | Le check local n'a pas pu compiler Rust (Cargo absent) et ne vaut pas validation d'installateur | Maintenir les checks Desktop |
| Desktop | Installateurs, association PDF, double-clic, destination native, signatures/notarisation, mises à jour | Partiel | matrice explicite dans `DESKTOP.md`, limites `AGENTS.md` | Aucun flux Save As natif, association ou validation de bundle utilisateur | P1 release |
| Architecture | Orchestration frontend et styles de workspace | Fragile | `App.tsx` est passé de 6 132 à 5 992 lignes avec `pdf/documentLifecycle.ts` extrait ; `forms.css` isole 81 lignes de `App.css` (3 647 lignes) | Une grande partie des domaines reste centralisée dans `App.tsx` / `App.css` | P1 extractions comportementales successives |
| Tests | Unitaires, frontend, backend et E2E Web | Partiel | Vitest, pytest et specs Playwright versionnées | Pas de campagne Tauri automatisée ; corpus lourd et lecteurs tiers incomplets | P1/P2 selon domaine |
| Sécurité | Traitement local, validation formats, temporaires et limites conversion | Partiel | `app/ocr.py` (taille/pages, timeout, groupe de processus, nettoyage), `test_ocr.py` (en-tête invalide, PDF chiffré) | Corpus hostile, multipart HTTP, annulation et tous les chemins subprocess restent à qualifier plus largement | P1 robustesse |

## Fonctions désormais couvertes dans le périmètre Web

- recherche locale `Ctrl/Cmd+F` avec annulation, résultats compacts et
  géométrie d'occurrence basée sur la text layer ;
- impression de l'état courant via aperçu interne, iframe temporaire et
  fallback explicite ;
- AcroForms standards de la page active, valeurs dirty/undoable et persistance
  des boutons (`/V` et `/AS`) sans aplatissement ;
- verrou local non dirty/non historique et verrou PDF ReadOnly distinct,
  undoable avant sauvegarde ;
- rendu readonly : le canvas conserve la seule apparence visuelle native et la
  couche React devient une cible sémantique non interactive ;
- CI backend Ubuntu reproductible pour les tests OCR réels, au lieu d'un skip
  implicite provoqué par une dépendance système absente.

## Écarts documentation / code / tests

1. Les écarts README précédents sur l'apparence readonly et le verrouillage ont
   été corrigés : `README.md` décrit maintenant la couche interactive des
   widgets éditables, l'apparence canvas des readonly, le verrou local et le
   verrou PDF ReadOnly séparément.
2. `QA_BROWSER_REPORT.md` reste historique. `QA_AUTOMATION.md` décrit le
   protocole, mais ni l'un ni l'autre ne constitue une preuve d'un run Tauri ou
   d'une compatibilité avec des lecteurs PDF tiers.
3. La CI backend exécute désormais réellement OCR et Ruff sur Ubuntu 24.04,
   mais le dépôt ne contient pas de résultat GitHub Actions durable : ne pas
   transformer l'absence de trace versionnée en preuve multi-OS.
4. `DESKTOP.md` documente désormais la matrice de support réelle : elle expose
   explicitement l'absence de Save As natif, de double-clic et de packaging OCR
   plutôt que de les laisser implicites dans le workflow Web.

## Priorités restantes

| Priorité | Sujet | Impact / probabilité | Effort | Dépendances |
| --- | --- | --- | --- | --- |
| P1 | Packaging release Tauri des outils OCR/conversion et validation OS | Élevé / élevé | XL | Windows, macOS, Linux, licences/outils système |
| P1 | Mesures structurées mémoire/export sur corpus 250+ pages et limites produit | Élevé / moyen | M | profiler machines cibles, Firefox/WebView, fixtures synthétiques |
| P1 | Robustesse entrées/subprocess : multipart, corpus PDF anormal étendu, annulation et nettoyage | Élevé / moyen | M | moteur Python, corpus sécurité |
| P1 | Modularisation progressive de `App.tsx` et `App.css` | Élevé / élevé | XL | tests de non-régression |
| P2 | QA Desktop/HiDPI et compatibilité impression/formulaires avec lecteurs tiers | Moyen / moyen | L | runners natifs, machines/lecteurs réels |
| P2 | Corpus fidélité native text/fonts, DOCX complexe et apparences AcroForm non standard | Moyen / moyen | L | fontes redistribuables, fixtures synthétiques |
| P2 | Clarifier IndexedDB, crash recovery et documents récents | Moyen / moyen | M | décision UX produit |
| P2 | Suivi d'exécution CI et couverture d'intégration multipart complète | Moyen / moyen | M | GitHub Actions, client HTTP de test |
| P3 | Recherche : index léger ou amélioration de performance sur corpus très long | Faible / moyen | M | mesure produit préalable |
| P3 | Fonctions PDF pro hors périmètre : redaction, signatures numériques, outlines, pièces jointes | Variable / produit | L–XL | décision de périmètre |
| P3 | Raccourcis configurables et aide dédiée | Faible / moyen | M | préférences utilisateur |

## Quick wins et sujets ultérieurs

1. Exécuter un smoke test Tauri dès qu'un runner Linux natif disposant de Cargo
   et du loopback est disponible.
2. Mettre en œuvre et valider le packaging/détection des outils OCR et de
   conversion par OS selon la matrice `DESKTOP.md`.
3. Créer un corpus synthétique de PDF chiffrés/corrompus, de formulaires aux
   appearances atypiques et d'exports lourds.
4. Extraire progressivement les domaines de `App.tsx` sans mélanger refactor
   et changement fonctionnel.
