# Revue fonctionnelle et technique du projet

> État observé le 20 septembre 2026 après le cycle de stabilisation. Cette revue s'appuie sur le code suivi,
> les tests versionnés et la documentation du dépôt ; elle ne constitue pas une
> certification d'installateur ou de matériel qui n'a pas été exécutée.

## Résumé exécutif

PDF Studio Local couvre le socle local-first : ouverture et persistance locale,
multi-document, viewer, organisation de pages, édition d'objets, export, OCR et
conversion. Les développements récents ont aussi apporté la recherche PDF
incrémentale, une impression depuis l'état courant avec aperçu interne, et une
première prise en charge des AcroForms standards.

Les fonctionnalités de recherche, impression et formulaire sont réelles et
testées, mais restent **partielles** au sens produit : leurs limites sont
documentées et aucune campagne de release native complète ne les valide encore
sur Windows, macOS et Linux. Le cycle de stabilisation a étendu le corpus backend
hostile, extrait le cycle de vie documentaire et la recherche de `App.tsx`, puis
qualifié une fixture de 250 pages / 53 508 898 octets dans Chromium et Firefox.

La fermeture ne conserve plus de ressource structurelle observée (canvases,
iframe d'impression ou entrée IndexedDB), y compris après trois cycles et deux
documents lourds. Ce résultat ne suffit pas à déclarer les très gros PDF
complets : Continu borne désormais ses canvases/text layers à une fenêtre autour
du viewport, mais il n'existe pas de profil RAM/GPU ou WebView natif. Les risques prioritaires
sont donc le workflow de fichiers Desktop réellement natif, sa validation par
OS, la stratégie de distribution OCR/conversion, la scalabilité de Continu et
la poursuite de la modularisation de `App.tsx` / `App.css`.

## Architecture observée

| Couche | Responsabilité | Preuve |
| --- | --- | --- |
| Web | React/Vite, viewer PDF.js, état d'édition, IndexedDB, export multipart | `apps/web/src/App.tsx`, `pdf/documentLifecycle.ts`, `hooks/usePdfSearch.ts` |
| Desktop | fenêtre Tauri, port loopback dynamique, cycle du sidecar | `apps/desktop/src-tauri`, `DESKTOP.md` |
| Moteur | FastAPI/PyMuPDF/pypdf : export, texte natif, OCR, conversion, valeurs AcroForm | `services/pdf-engine/app/main.py` |
| QA | Vitest, pytest, Playwright et fixtures synthétiques | `apps/web/src/**/*.test.*`, `services/pdf-engine/tests`, `apps/web/e2e` |
| CI backend | `uv` verrouillé et toolchain OCR Ubuntu 24.04 | `.github/workflows/ci.yml` |

## Matrice fonctionnelle

| Domaine | Fonction | État | Preuve | Limitation | Action suggérée |
| --- | --- | --- | --- | --- | --- |
| Fichiers | Ouvrir, onglets, fermer, dirty confirmation | Complet | `App.tsx`, `App.test.tsx`, E2E save/navigation | Les raccourcis Web réservés restent laissés au navigateur | Maintenir les E2E |
| Fichiers | Sauvegarde / Save As | Partiel | export multipart, `SaveAsDialog.tsx`, tests save/export | Web et WebView téléchargent ; aucun chemin Desktop n'est mémorisé ou écrit nativement | P1 workflow fichiers Desktop |
| Fichiers | Restauration locale | Partiel | IndexedDB dans `App.tsx`, `viewerStorage.test.ts`, E2E persistence | Quotas et récupération après crash non qualifiés sur les navigateurs cibles | P2 UX / limites produit |
| Fichiers | Récents, drag-and-drop d'ouverture | Absent | aucun composant, commande ni scénario dédié trouvé | Hors périmètre actuellement documenté | P3 si besoin produit |
| Fichiers | PDF chiffrés / corrompus | Partiel | `test_robustness.py`, `test_ocr.py`, validation backend et `CONVERSION.md` | Pas de saisie de mot de passe ; le corpus reste synthétique | P2 selon cible produit |
| Viewer | Continu, Page unique, Présentation, navigation | Complet | `App.tsx`, `viewer-modes.spec.ts`, `QA_AUTOMATION.md` | Validation physique Tauri/HiDPI séparée | Maintenir la campagne Web |
| Viewer | DPR, resize et transition front/back | Partiel | `viewer/rendering.test.ts`, `viewer-page-transition.spec.ts`, `ui-workspace-responsive.spec.ts` | GPU, WebView Tauri et HiDPI réels non couverts automatiquement | P1 QA Desktop |
| Viewer | Gros PDF / mémoire | Partiel | `QA-E2E-015`/`PERF-MEMORY-002`, `continuousRenderWindow.ts`, `documentLifecycle.ts`, `QA_AUTOMATION.md` : 250 pages / 53 508 898 octets testés dans Chromium et Firefox ; shells complets, fenêtre Continu bornée (3 canvases initiaux, ≤12 pendant sauts), trois cycles, deux documents et export ; zéro ressource structurelle après fermeture | Aucune mesure RAM/GPU totale ni WebView native ; PDF.js et IndexedDB conservent volontairement le document ouvert | P2 profiler RAM/GPU/WebView et qualifier des corpus extrêmes |
| Édition | Texte ajouté, signatures, formes, dessin, commentaires, markup | Complet | couches d'édition, exports et E2E dédiés | Fidélité dépendante de la police source | Maintenir les tests export |
| Édition | Texte PDF natif | Partiel | `NativeTextLayer.tsx`, API `/pdf/native-text*`, `NATIVE_TEXT_EDITING.md` | Spans homogènes/rotations orthogonales ; shaping et transforms avancés exclus | P2 `NATIVE-TEXT-002` |
| Édition | Polices intégrées et personnalisées | Partiel | `FontRegistry`, import/sélecteur, diagnostics et export | Collections, variables, shaping et subsets avancés limités | P2 corpus de compatibilité |
| Pages | Rotation, suppression, duplication, réorganisation, ajout depuis PDF ouvert | Complet | `OrganizationPanel.tsx`, `/pdf/export/organize`, E2E | — | Maintenir la couverture |
| Pages | Split/extraction avancée | Hors périmètre | limites explicites `README.md`, absence d'UI dédiée | Aucune action autonome | Ticket produit si requis |
| Recherche | Ctrl/Cmd+F, scan incrémental multi-page, navigation et highlights | Partiel | `pdf/search.ts`, `hooks/usePdfSearch.ts`, `PdfSearchBar.tsx`, tests géométriques/E2E | Scan séquentiel sans index persistant ; pas de QA native exhaustive | P2 décider un index seulement après mesure produit |
| Impression | Aperçu interne et impression de l'état courant | Partiel | `PrintPreviewDialog.tsx`, `saving/print.ts`, tests unitaires et `print-workflow.spec.ts` | Dialogue système/WebView non automatisable et non validé par OS ; fallback par nouvel onglet seulement à la demande | P1 QA release Desktop |
| Formulaires | Détection et édition AcroForm page-scoped | Partiel | `/pdf/forms`, `PdfFormLayer.tsx`, `test_forms.py`, `pdf-forms.spec.ts` | XFA absent ; seuls texte, multiline, checkbox, radio, combo et list sont ciblés | P2 élargir le corpus de widgets |
| Formulaires | Valeurs, checkbox/radio et sauvegarde sans flatten | Partiel | `_apply_form_values_to_writer`, `test_forms.py` vérifie `/V`, `/AS` et réouverture | Valeurs et verrou refusés après réorganisation des pages ; validation lecteurs tiers non versionnée | P2 conservation structurelle / QA lecteurs |
| Formulaires | Verrou local et verrou ReadOnly PDF | Partiel | `FormLockToolbar.tsx`, `PdfFormLockEdit`, `_apply_acroform_read_only_lock`, tests état/forms/E2E | ReadOnly n'est pas une protection cryptographique ; pas d'aplatissement ; validation externe manuelle restante | P2 documenter la compatibilité lecteurs |
| Formulaires | Rendu readonly sans double valeur | Partiel | `PdfFormLayer.tsx`, `PdfFormLayer.test.tsx`, scénario `FORM-READONLY-RENDER-001` | Le canvas est l'unique rendu visuel des widgets readonly connus ; apparences AcroForm exotiques restent à qualifier | P2 corpus d'apparences non standard |
| OCR | OCR local fra/eng/mixte et réouverture | Partiel | `OcrDialog.tsx`, `/ocr`, `tests/test_ocr.py`, E2E OCR ; limites de taille/pages, timeout et nettoyage dans `app/ocr.py` | Qualité/durée dépendent des binaires et du scan ; packaging OS incomplet | P1 packaging et feedback |
| Conversion | DOCX, TXT, HTML, PNG, JPEG sortants | Partiel | `/convert`, `CONVERSION.md`, tests backend/E2E | DOCX complexe sans fidélité garantie | P2 corpus de fidélité |
| CI backend | Tests OCR et Ruff sur runtime Ubuntu supporté | Partiel | `.github/workflows/ci.yml` installe/vérifie Tesseract `eng`, OCRmyPDF, Ghostscript et QPDF avant `uv sync --locked`, pytest et Ruff ; campagne ROBUSTNESS-002 : 262 passés, 2 ignorés | La configuration est bornée à Ubuntu 24.04 ; aucun rapport GitHub Actions récent n'est versionné | P2 suivre les runs CI sans contourner les tests OCR |
| PDF pro | Outlines, pièces jointes, redaction, mots de passe, signature numérique | Hors périmètre | aucune commande/composant/route/test correspondant ; limites dans `AGENTS.md` | Ces fonctions ne sont pas promises actuellement | Décision produit avant implémentation |
| UX | Thèmes, confirmations, erreurs métier et raccourcis minimums | Partiel | `commands/appShortcuts.ts`, dialogues, tests unitaires/E2E | Rapports manuels historiques ; raccourcis réservés navigateur volontairement absents | Rafraîchir QA à chaque release |
| Desktop | Sidecar, health/restart et port dynamique en développement | Partiel | `apps/desktop/src-tauri`, `desktop:check:static`, tests du lanceur et `DESKTOP.md` | Configuré et testé statiquement ; Rust/Cargo absents, aucune compilation/WebView native validée | P1 smoke test puis QA native par OS |
| Desktop | Association `.pdf`, ouverture OS et workflow fichier | Partiel | `tauri.conf.json` déclare `.pdf`/`application/pdf`, matrice `DESKTOP.md` et check statique | Association seulement configurée ; aucun argument de lancement, double-clic, Save/Save As natif ou chemin mémorisé | P1 `DESKTOP-NATIVE-FILES-001` sur machine native |
| Desktop | OCR/conversion et installateurs | Partiel | stratégie de dépendances système par OS dans `DESKTOP.md`, diagnostics backend existants | Tesseract/tessdata/OCRmyPDF/Ghostscript/QPDF non embarqués ; licences, installateurs, signing et notarisation non validés | P1 packaging/distribution + QA OS |
| Architecture | Orchestration frontend et styles de workspace | Fragile | `documentLifecycle.ts` et `usePdfSearch.ts` extraits ; `App.tsx` 5 992 → 5 842 lignes, `App.css` 3 647 lignes | Forms, print, OCR, conversion et pipeline export restent fortement couplés au reducer/App | P1 extractions comportementales successives |
| Tests | Unitaires, frontend, backend et E2E Web | Partiel | Vitest, pytest et specs Playwright versionnées | Pas de campagne Tauri automatisée ; corpus lourd et lecteurs tiers incomplets | P1/P2 selon domaine |
| Sécurité | Traitement local, validation formats, temporaires et limites conversion | Partiel | `test_robustness.py`, `test_ocr.py`, `app/ocr.py` : vide, faux PDF, tronqué, xref/objets/AcroForm invalides, chiffré, timeout/annulation, cleanup, health et requête valide après erreur | Pas de fuzzing exhaustif ni de couverture multipart HTTP intégrale | P2 élargir seulement les chemins de risque mesurés |

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
- corpus backend hostile : erreur métier contrôlée, nettoyage et requête PDF
  valide immédiatement après l'erreur ;
- qualification gros PDF Chromium + Firefox : navigation, zoom, trois cycles,
  multi-document et export léger, avec nettoyage structurel à la fermeture.

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
4. `DESKTOP.md` documente désormais la matrice de support réelle : l'association
   `.pdf` est **configurée**, mais l'import des arguments, le double-clic, Save
   As natif et la QA d'un installateur restent **non supportés/non testés**.
5. `QA_AUTOMATION.md` apporte une preuve Chromium + Firefox de nettoyage
   structurel et de fenêtre de rendu bornée sur 250 pages. Elle ne constitue pas
   pour autant un profil de mémoire RAM/GPU ni une validation WebView native.

## Priorités restantes

| Priorité | Sujet | Impact / probabilité | Effort | Dépendances |
| --- | --- | --- | --- | --- |
| P1 | Workflow fichiers Desktop natif : Open, Save/Save As, gestion de chemin et erreurs | Élevé / élevé | L | Rust/Cargo, API native de dialogue/fichiers, machine cible |
| P1 | Build/installateur Tauri et packaging OCR/conversion par OS | Élevé / élevé | XL | Windows, macOS, Linux, licences/outils système, credentials éventuels |
| P2 | Qualifier la RAM/GPU et la WebView sur des corpus Continu extrêmes | Moyen / moyen | L | profilage natif/WebView, corpus 500+ pages si justifié |
| P1 | Modularisation progressive de `App.tsx` et `App.css` | Élevé / élevé | XL | tests de non-régression |
| P2 | QA Desktop/HiDPI et compatibilité impression/formulaires avec lecteurs tiers | Moyen / moyen | L | runners natifs, machines/lecteurs réels |
| P2 | Corpus fidélité native text/fonts, DOCX complexe et apparences AcroForm non standard | Moyen / moyen | L | fontes redistribuables, fixtures synthétiques |
| P2 | Clarifier IndexedDB, crash recovery et documents récents | Moyen / moyen | M | décision UX produit |
| P2 | Couverture multipart HTTP d'intégration et suivi d'exécution CI | Moyen / moyen | M | GitHub Actions, client HTTP de test |
| P2 | Robustesse backend au-delà du corpus actuel : fuzzing limité ou cas externes mesurés | Moyen / faible | M | moteur Python, corpus synthétique |
| P3 | Recherche : index léger ou amélioration de performance sur corpus très long | Faible / moyen | M | mesure produit préalable |
| P3 | Fonctions PDF pro hors périmètre : redaction, signatures numériques, outlines, pièces jointes | Variable / produit | L–XL | décision de périmètre |
| P3 | Raccourcis configurables et aide dédiée | Faible / moyen | M | préférences utilisateur |

## Quick wins et sujets ultérieurs

1. Exécuter un smoke test Tauri dès qu'un runner Linux natif disposant de Cargo
   et du loopback est disponible ; il débloque la validation de toute nouvelle
   couche Rust/Desktop.
2. Préparer un ticket distinct pour le workflow fichier natif, avec une
   interface IPC bornée et des mocks frontend, sans exposer le filesystem entier
   à la WebView.
3. Réserver un profilage RAM/GPU/WebView à un corpus plus extrême avant toute
   optimisation supplémentaire du viewer ; la fenêtre de rendu Continu borne
   déjà les ressources DOM coûteuses sur 250 pages.
4. Extraire progressivement les domaines Forms, print, OCR/conversion ou export
   de `App.tsx` sans mélanger refactor et changement fonctionnel.

## Prochain chantier recommandé

1. **`DESKTOP-NATIVE-FILES-001` — workflow fichier Desktop natif**, à exécuter
   sur une machine ayant Rust/Cargo et une WebView cible. C'est le principal
   écart entre l'application Desktop annoncée et le flux actuellement livré :
   l'association `.pdf` est déclarée, mais aucun double-clic/argument n'est
   consommé, et Save/Save As restent des téléchargements WebView.
2. **Qualifier le viewer sur un corpus plus extrême et une WebView native**,
   seulement après disponibilité d'une machine Tauri : la fenêtre Continu est
   désormais bornée dans Chromium/Firefox, mais la RAM/GPU et WebView restent
   non mesurées.
3. **`MODULARIZATION-003` — extraire un domaine fortement couplé**, après le
   choix Desktop/Continu. Cette dette reste P1, mais elle n'est pas un blocage
   fonctionnel aussi direct que les deux candidats précédents.
