# Audit fonctionnel de PDF Studio Local

## 1. Résumé exécutif

- PDF Studio Local couvre les opérations quotidiennes sur un PDF, de la lecture à la production d’une copie éditée.
- Le moteur sur boucle locale, les fichiers natifs gérés par Tauri et le stockage navigateur constituent trois frontières de fiabilité à qualifier.
- Le lecteur sait afficher cinq dispositions, rejoindre les renvois et parcourir les signets du document.
- Les blocs ajoutés, formes, images, signatures graphiques et annotations ont déjà des outils d’édition et un historique de session.
- Le plan de pages sait assembler des sources, dupliquer, déplacer et tourner les pages. Il possède son propre état.
- La navigation à sept catégories et les six palettes réduisent l’encombrement. La qualification de la WebView reste à faire.
- Le biffage par zones dispose de refus conservateurs et de contrôles sur le contenu exporté. La confidentialité hors de ces zones reste une autre opération.
- OCR et conversion traitent actuellement le fichier source. Le choix de traiter l’état édité rendrait ces parcours plus prévisibles.
- La préservation des liens, signets et formulaires dépend de la nature de la réorganisation. Les cas de refus sont importants pour éviter une perte silencieuse.
- La restauration navigateur est testée. Une copie déchiffrée peut toutefois rester dans IndexedDB après l’ouverture d’un PDF protégé.
- La première priorité produit est de qualifier l’installation et les fichiers sur une VM Windows propre selon le gate Preview existant.
- Les incréments suivants renforcent la confidentialité, le parcours d’enregistrement puis la composition des documents avant les investissements avancés.

## 2. Périmètre et méthode

Base initiale `7a1bdf0`, relue après la stabilisation des lots A–C à
`1b6c5ee541cebc51718ce52438b638f0f5d84ee5`. Audit réalisé le 21 novembre 2026 sur la branche
`agent/20261121T182557042078Z`. Inspection des entrées UI et des transitions
dans [App.tsx](../../apps/web/src/App.tsx), du [viewer](../../apps/web/src/viewer),
des [éditions](../../apps/web/src/editing), du [plan](../../apps/web/src/organize/pagePlan.ts),
de la [persistance](../../apps/web/src/storage/viewerStorage.ts), des
[modules FastAPI](../../services/pdf-engine/app), des [commandes Tauri](../../apps/desktop/src-tauri/src/lib.rs)
et du [serveur desktop](../../services/pdf-engine/app/desktop_server.py).
Les tests du dépôt, la documentation du produit et les cinq commits avant
intervention situent les preuves et les limites connues.

**Exécutions de ce ticket.** Vitest, typage et build web, scénarios Playwright Chromium 151 et Firefox 153 avec le moteur local, captures Clair/Sombre/Océan/Sable, zoom natif Chromium et zoom CSS sur les deux moteurs. Les tests de la matrice métier
cités pour preuve d’implémentation sont identifiés par leur fichier. La campagne
Python complète, la présentation sur écran externe physique, l’impression
native et une installation Tauri réelle sur Windows ou Linux restent hors
des résultats du ticket. La campagne principale a donné 24 réussites Chromium et 23 Firefox, la campagne métier 23 Chromium et 22 Firefox. Les deux scénarios Firefox signalés ont réussi en relance isolée. Les rapports précédents gardent leur périmètre et
leur date. Aucun benchmark externe effectué. Les estimations de fréquence et
d’effort sont des hypothèses de travail, sans télémétrie produit.

Le rapport propose des suites **après** les gates de
[MVP_STATUS.md](../../MVP_STATUS.md) et [NEXT_STEPS.md](../../NEXT_STEPS.md).
[TECHNICAL_DEBT.md](../../TECHNICAL_DEBT.md) porte les travaux structurels et
[QA_AUTOMATION.md](../../QA_AUTOMATION.md) les preuves attendues des campagnes.
[DÉVELOPPEMENT](../../DEVELOPMENT.md), [DESKTOP](../../DESKTOP.md),
[CONVERSION](../../CONVERSION.md), [édition native](../../NATIVE_TEXT_EDITING.md) et
[biffage](../../REDACTION_STAMPS.md) décrivent les contrats et limitations.

## 3. Cartographie des fonctions actuelles

**OK** désigne un parcours implémenté avec preuve ciblée dans son périmètre.
**Partiel** désigne une capacité bornée ou un sous-cas indisponible.
**Fragile** désigne un défaut reproduit ou documenté dans un environnement
nommé. **Absent** exige une absence explicitée dans le dépôt ou une inspection
du chemin d’entrée concerné. **Non vérifié** signale une qualification manquante.

| Fonction | Maturité | Implémentation, portée et preuve |
| --- | --- | --- |
| Ouvrir, zoomer, changer d’onglet, miniatures, cinq modes | OK | Orchestration dans [App.tsx](../../apps/web/src/App.tsx), rangées dans [pageLayout.ts](../../apps/web/src/viewer/pageLayout.ts). Scénarios [viewer-modes](../../apps/web/e2e/specs/viewer-modes.spec.ts), [multi-document](../../apps/web/e2e/specs/multi-document.spec.ts) et [liens/multipage](../../apps/web/e2e/specs/pdf-links-layout-sidebar.spec.ts) |
| Lectures HiDPI et longues sessions | Partiel | Fenêtre de pages visibles avec marge et deux buffers en page unique. Le test synthétique à 250 pages vérifie moins de 45 canvas. La métrique ne couvre ni DOM complet ni RAM ou GPU natifs. [Fenêtre de rendu](../../apps/web/src/viewer/continuousRenderWindow.ts), [PDF-PERF-001](../../TECHNICAL_DEBT.md#pdf-perf-001--limites-mémoire-et-exports-extrêmes) |
| Liens, sommaires cliquables et signets | Partiel | Navigation HTTP(S) et GoTo, édition d’un sous-ensemble, signets en lecture seule. Les liens sont remappés à l’export organisé, les signets restent à reconstruire pour ce cas. [PdfLinks.tsx](../../apps/web/src/components/PdfLinks.tsx), [serveur](../../services/pdf-engine/app/pdf_links.py), [tests des liens](../../services/pdf-engine/tests/test_pdf_links.py) |
| Recherche | Partiel | Recherche du texte source, normalisation et affichage des occurrences. Les objets ajoutés et les scans sans couche texte sont hors du corpus de recherche actif. [usePdfSearch](../../apps/web/src/hooks/usePdfSearch.ts), [pdf-search](../../apps/web/e2e/specs/pdf-search.spec.ts), [règles de biffage](../../REDACTION_STAMPS.md#rechercher-et-biffer) |
| Texte ajouté, polices, ajustement | OK | Blocs avec style, import local de polices validées, preview et export. Alerte sur débordement et export best effort pour certains cas. [TextEditLayer](../../apps/web/src/components/TextEditLayer.tsx), [catalogue](../../apps/web/src/fonts/catalog.ts), [text-position-fidelity](../../apps/web/e2e/specs/text-position-fidelity.spec.ts) |
| Modification du texte source | Partiel | Spans homogènes compatibles et rotations orthogonales. Shaping complexe, glyphes, matrices et styles mêlés limitent les éditions sûres. [NativeTextLayer](../../apps/web/src/components/NativeTextLayer.tsx), [contrat](../../NATIVE_TEXT_EDITING.md), [tests Python](../../services/pdf-engine/tests/test_native_text_edit.py) |
| Formes, dessin, images et ordre des objets | OK | Poignées, styles, opacité, recadrage et ordre des objets ajoutés. La sélection d’édition est un ID dans [App.tsx](../../apps/web/src/App.tsx). [LayerControls](../../apps/web/src/components/LayerControls.tsx), [objectGeometry](../../apps/web/src/editing/objectGeometry.ts), [exports formes](../../services/pdf-engine/tests/test_shape_export.py) |
| Sélection multiple d’objets, alignement et accrochage entre objets | Absent | Les contrôles de calques et l’inspecteur ne proposent qu’un objet à la fois. La sélection multiple de pages est un flux distinct. [LayerControls](../../apps/web/src/components/LayerControls.tsx), [App.tsx](../../apps/web/src/App.tsx) |
| Images ouvertes comme documents et conversion images vers PDF | OK | PNG, JPEG et WebP statiques comme sources, transformations locales et liste ordonnée. Le recadrage est visuel. [ImageDocumentDialog](../../apps/web/src/components/ImageDocumentDialog.tsx), [ImagesPdfDialog](../../apps/web/src/components/ImagesPdfDialog.tsx), [QA images](../../docs/QA_IMAGE_DOCUMENTS.md) |
| Signature visuelle | OK | Dessin ou import local, placement et édition d’une image. [SignatureDialog](../../apps/web/src/components/SignatureDialog.tsx), [signature-editing](../../apps/web/e2e/specs/signature-editing.spec.ts) |
| Signature cryptographique | Absent | Composition, AES et aplatissement déjà disponibles. La création et validation CMS/PAdES sont différées. [Périmètre certificat](../../SIGNATURE_NUMERIQUE_004.md) |
| Commentaires et annotations | Partiel | Ajout de commentaires et de surlignage, soulignement et barré. Les objets locaux ont leur édition et leur historique. Les annotations d’origine restent dans la couche PDF et hors de l’ordre des objets ajoutés. [PdfEditLayer](../../apps/web/src/components/PdfEditLayer.tsx), [tests commentaires](../../services/pdf-engine/tests/test_comments.py), [contrat](../../DEVELOPMENT.md#api-et-composition-pdf) |
| Biffage, recherche et confidentialité | Partiel | Résolution géométrique des correspondances, rectangles en attente, suppression dans une copie réécrite. Le masquage, les tampons et les filigranes gardent les données. Les PDF complexes peuvent être refusés. Les métadonnées et le contenu hors zones restent en place. [REDACTION_STAMPS](../../REDACTION_STAMPS.md), [tests biffage](../../services/pdf-engine/tests/test_secure_redaction.py) |
| Tampons et filigranes | OK | Propriétés, images de tampon, texte, portée de pages et répétition. L’export intègre les marquages. Les presets d’équipe persistants ne figurent pas parmi les commandes. [WatermarkComposer](../../apps/web/src/components/WatermarkComposer.tsx), [StampInspector](../../apps/web/src/components/StampInspector.tsx), [tests filigranes](../../services/pdf-engine/tests/test_watermark_export.py) |
| Pages, composition et extraction | Partiel | Rotation, suppression, duplication, ordre, composition multi-source et export du plan. L’extraction dédiée par plages ou en lot reste hors périmètre déclaré. [pagePlan.ts](../../apps/web/src/organize/pagePlan.ts), [organize-pages](../../apps/web/e2e/specs/organize-pages.spec.ts), [AGENTS](../../AGENTS.md) |
| Historique et restauration | Partiel | Undo/redo des éditions par document, plans persistés et historique borné en session. Les changements du plan de pages et l’historique après rechargement suivent des règles différentes. [state.ts](../../apps/web/src/editing/state.ts), [viewerStorage](../../apps/web/src/storage/viewerStorage.ts), [storage-upgrade](../../apps/web/e2e/specs/storage-upgrade.spec.ts) |
| AcroForms et finalisation | Partiel | Valeurs et verrou ReadOnly pour les widgets pris en charge. Édition non proposée sur plan réorganisé, changement de plan refusé après certaines éditions. [PdfFormLayer](../../apps/web/src/components/PdfFormLayer.tsx), [tests formulaires](../../services/pdf-engine/tests/test_forms.py), [MVP](../../MVP_STATUS.md) |
| Chiffrement et accès aux PDF protégés | Partiel | Export AES-256 et permissions côté moteur, ouverture par saisie ponctuelle. Copie de travail locale déchiffrée possible et droits interprétés par le lecteur cible. [passwords.ts](../../apps/web/src/pdf/passwords.ts), [passwords.py](../../services/pdf-engine/app/passwords.py), [tests Playwright](../../apps/web/e2e/specs/password-protection.spec.ts) |
| Accessibilité du PDF et métadonnées | Non vérifié | La composition et les tests de biffage inspectent certaines structures sensibles. Aucune preuve ciblée d’une conformité PDF/UA après réorganisation ou d’un flux de nettoyage général. [export](../../services/pdf-engine/app/main.py), [tests export](../../services/pdf-engine/tests/test_export_organize.py) |
| OCR | Partiel | Parcours local avec sortie recherchable, annulation et réouverture, rotation manuelle et redressement selon le runtime. La détection automatique d’orientation est absente. La reconnaissance, les délais et la matrice installée restent à mesurer. [ocr.py](../../services/pdf-engine/app/ocr.py), [runtime](../../services/pdf-engine/app/ocr_runtime.py), [orientation](../../apps/web/e2e/specs/ocr-orientation.spec.ts) |
| Conversion PDF vers DOCX, TXT, HTML, PNG et JPEG | Partiel | S’exécute sur la source et propose des réglages par format. Reconstruction DOCX limitée selon la mise en page. [useDocumentProcessing](../../apps/web/src/hooks/useDocumentProcessing.ts), [routes de conversion](../../services/pdf-engine/app/conversion/routes.py), [contrat DOCX](../../CONVERSION.md) |
| Enregistrement, modification de fichiers et impression native | Fragile | Save As initial, destination atomique Rust, source préservée, Save/Export navigateur. Preview Windows limitée à 25 Mio. Impression WebView2 échouée au gate général après chargement de l’aperçu. [Tauri](../../apps/desktop/src-tauri/src/lib.rs), [contrats de sauvegarde](../../DESKTOP.md#fichiers-et-frontière-ipc), [gate Windows](../../NEXT_STEPS.md) |
| Ergonomie et accessibilité des commandes | OK | Sept catégories SVG, noms accessibles, palette et placement partagés. Scénarios clavier et fenêtres réduites. Les parcours réels WebView, tactile et lecteur d’écran restent à qualifier. [QA thèmes/navigation](../../docs/QA_THEMES_NAV_OVERLAYS.md), [raccourcis](../../apps/web/e2e/specs/shortcuts-audit.spec.ts) |
| Distribution desktop | Non vérifié | Supervision, commandes IPC et binaires du sidecar présents. La preuve historique du poste de développement ne qualifie pas installation et upgrade sur machine propre. [DESKTOP](../../DESKTOP.md), [MVP_STATUS](../../MVP_STATUS.md), [entrée sidecar et tests](../../services/pdf-engine/tests/test_desktop_server.py) |

## 4. Irritants et risques techniques

| Symptôme | Fréquence / gravité estimées | Reproduction ou limite |
| --- | --- | --- |
| Le PDF biffé peut encore contenir une identité hors des zones | Fréquence selon le document, gravité élevée | Le texte d’avertissement est présent. Une fixture avec une sentinelle dans les métadonnées et une autre dans la zone rend la distinction mesurable. Les structures non prises en charge sont refusées. [Biffage](../../REDACTION_STAMPS.md) |
| Une copie déchiffrée reste récupérable depuis le navigateur | Fréquence à mesurer, gravité haute sur poste partagé | Ouvrir un PDF protégé, recharger puis rouvrir le profil. Le contrat de stockage autorise cette restauration. Contrôler la suppression et l’échec quota séparément. [PDF protégés](../../README.md#pdf-protégés) |
| Une conversion peut omettre des edits visibles à l’écran | Fréquent chez les utilisateurs qui composent avant de convertir, impact moyen à élevé | Ajouter du texte ou tourner une page, lancer Conversion depuis cet onglet. Le client envoie `sourceDocument.file`. [Traitements](../../apps/web/src/hooks/useDocumentProcessing.ts) |
| Un téléchargement TXT a ignoré le nom personnalisé dans un essai Firefox | Un échec intermittent constaté, fréquence inconnue, gravité faible à moyenne | QA-CONV-002 a reçu le nom par défaut pendant la campagne. Le scénario complet a réussi isolément sur la base et sur la version livrée. [Scénario de conversion](../../apps/web/e2e/specs/conversion.spec.ts) |
| Ctrl+Z revient sur du texte mais ne remonte pas une suppression dans le plan | Fréquence probable en organisation, impact moyen | L’historique d’édition et le plan sont séparés. Le raccourci historique est désactivé en mode organiser. [App](../../apps/web/src/App.tsx), [MVP WIP](../../MVP_STATUS.md#wip--limitations-connues) |
| Un formulaire déjà rempli bloque certaines réorganisations | Fréquence selon le flux, gravité moyenne | Éditer une valeur sur un plan source puis tenter un changement de pages. Le code bloque le cas et propose le chemin de réouverture après enregistrement. [App](../../apps/web/src/App.tsx), [tests formulaires](../../services/pdf-engine/tests/test_forms.py) |
| Écarts de rendu du DOCX, du texte natif ou des filigranes anciens | Fréquence dépendante des documents, gravité moyenne | Mise en page multicolonne, fonte atypique et métriques différentes sont des familles distinctes. Les fixtures synthétiques et un cas de régression DOCX offrent une base, sans connaissance de la répartition réelle. [Conversion](../../CONVERSION.md), [texte natif](../../NATIVE_TEXT_EDITING.md), [tampons](../../REDACTION_STAMPS.md) |
| Destination de lien décalée ou signet perdu selon le document | Fréquence inconnue, gravité moyenne | Le renvoi XYZ a atteint la page cible sans conserver sa position verticale dans une campagne Firefox. Trois répétitions isolées passent sur la base et sur la version livrée. Tester aussi l’export avec doublons et source cible supprimée. La reconstruction des signets reste exclue du contrat de réorganisation actuel. [Dette liens](../../TECHNICAL_DEBT.md#liens-pdf-et-export-réorganisé) |
| Chargements, sauvegarde et restauration sous pression mémoire | Fréquence inconnue au-delà des seuils, gravité élevée | 50 Mo, 250 pages et huit onglets sont des seuils d’avertissement. Les scénarios synthétiques mesurent comportements et erreurs, la RAM totale et les limites GPU restent à capturer sur les cibles. [Dette mémoire](../../TECHNICAL_DEBT.md#pdf-perf-001--limites-mémoire-et-exports-extrêmes), [stress assets](../../apps/web/e2e/specs/asset-stress.spec.ts) |
| Impression Windows annoncée avant résultat OS | Fréquence élevée sur la candidate historique testée, gravité élevée pour un utilisateur qui veut imprimer | Le gate Windows a constaté l’absence du dialogue et du fichier produit. Le parcours Preview documenté passe par une copie ouverte dans un lecteur externe. [WINDOWS-PRINT-006](../../TECHNICAL_DEBT.md#windows-print-006--dialogue-windows-non-obtenu) |
| Indications documentaires contradictoires sur les PDF protégés | Fréquence inconnue, gravité faible à moyenne | La section d’ouverture protégée décrit le dialogue existant. Une phrase de la section export évoque encore son absence. À réconcilier avec les tests. [README](../../README.md#pdf-protégés), [password-protection](../../apps/web/e2e/specs/password-protection.spec.ts) |

## 5. Backlog argumenté

Échelle 1–5 pour valeur **V**, réduction du risque **R**, facilité **F** et
confiance **C**. Valeur et fréquence estimées ensemble. Facilité haute signifie
effort faible. La confiance porte sur les preuves techniques. L’effort **S**
est une évolution localisée, **M** traverse un parcours, **L** change plusieurs
domaines ou contrats, **XL** exige une qualification dédiée. La priorité combine
le support annoncé, l’impact en production et les prérequis.

| Piste et type | Besoin, impact et périmètre | Dépendances et risques | V/R/F/C | Effort / priorité |
| --- | --- | --- | --- | --- |
| QUALIF-01 · Qualification Preview · socle | Installer le candidat exact sur VM vierge, ouvrir, enregistrer, relancer et produire un OCR hors ligne | Image VM, artefact et inventaire du gate Preview. Requalifier après un rebuild | 5/5/3/5 | M · P0 |
| PRIV-01 · Session protégée · socle | Comprendre la persistance du PDF déchiffré avant de l’ouvrir. Mode de session temporaire explicite | IndexedDB, nettoyage par ID, doublons et récupération existante. Perte de reprise volontaire à rendre lisible | 4/5/3/5 | M · P1 |
| SAVE-01 · Enregistrement observable · socle | Comprendre la destination, les erreurs et le résultat réouvert. Harmoniser les étapes Web/Tauri | Contrats de Save/Save As et scénarios IPC. Risque d’écrasement et d’état dirty effacé après erreur | 5/5/3/5 | M · P1 |
| PAGE-01 · Undo/redo du plan · socle | Annuler une suppression, un déplacement ou une rotation sans recréer le plan | Historique par document, versions du plan, contraintes formulaires. Risque de dérive des sources et du focus | 5/4/2/5 | L · P1 |
| PROCESS-01 · Source / composition · socle | Choisir la source ou la copie composée pour OCR et conversion, avec indication préalable | Génération de copie temporaire, annulation et budgets. Risque de laisser des temporaires ou de figer de mauvaises options | 4/4/3/5 | M · P1 |
| PERF-01 · Budgets mesurés · socle | Garder le viewer utilisable sur gros scans et sessions multi-assets. Mesurer latence, RAM/GPU, annulation et libération à la fermeture | Fixtures reproductibles et instrumentation Windows incluse. Risque d’établir un seuil sur une seule machine | 4/4/3/4 | M · P1 |
| PRINT-01 · Impression intégrée · socle de diffusion | Produire une impression vérifiable depuis la composition courante, avec feedback d’échec | WebView2 et QA native. Dépend de QUALIF-01, reste blocker de diffusion générale dans NEXT_STEPS | 4/4/2/5 | L · P1 |
| LINK-01 · Liens et signets exportés · socle | Préserver l’accès aux sections après rotation, duplication et fusion. Traiter les renvois sans cible | Contrat de remappage GoTo, tests PDF.js et PyMuPDF. Risque de signets pointant vers une page arbitraire | 4/3/2/5 | L · P2 |
| FORM-01 · Formulaires dans un plan · socle | Réorganiser un PDF rempli sans perdre les valeurs. Commencer par rotation et ordre mono-source | Identités des widgets, options d’aplatissement, refonte du contrat export. Risque de collisions de champs | 4/4/2/5 | L · P2 |
| TEXT-01 · Compatibilité du texte natif · socle | Connaître les portions remplaçables avant de cliquer et garder un rendu fidèle | Catalogue de polices, échantillons par écriture et matrices. Élargissement progressif pour éviter les faux positifs | 4/4/2/5 | L · P2 |
| OCR-01 · Contrôle des scans · socle | Améliorer le repérage des pages mal orientées et la reprise quand une page échoue | Pack OCR verrouillé, tests de qualité et mesure en VM. Risque de régression texte ou de fichiers trop gros | 4/3/3/4 | M · P2 |
| DOCX-01 · Fidélité mesurable · socle | Prédire si le DOCX convient à l’édition, avec contrôle des tableaux et colonnes du corpus synthétique | Rendu de comparaison et LibreOffice disponible sur la machine QA. Risque de surajuster les fixtures | 3/3/3/4 | M · P2 |
| PAGE-02 · Extraire une sélection en copie · socle | Exporter quelques pages sans supprimer manuellement le reste du plan | PAGE-01 et règles sur liens et formulaires. Risque d’écraser l’état de travail ou d’exporter la mauvaise sélection | 4/3/3/4 | M · P2 |
| PRIV-02 · Prévol de biffage et métadonnées · socle | Vérifier avant export si le PDF est biffable et rendre visibles les catégories de données hors zones | Parseur et corpus de refus existants, contrôles indépendants. Toute promesse de nettoyage complet demande un chantier distinct | 4/5/3/5 | M · P2 |
| OBJECT-01 · Alignement et sélection multiple · différenciation | Aligner et déplacer des objets ajoutés en une opération | Géométrie page/rotation et undo/redo groupé. Risque de conflit avec la sélection PDF et les poignées | 3/2/2/4 | L · P3 |
| STAMP-01 · Presets locaux · différenciation | Réutiliser l’apparence d’un tampon ou filigrane entre documents | Schéma versionné, bibliothèque et suppression d’assets. Risque d’enregistrer une image sensible sans indication | 3/2/4/4 | S · P3 |
| CERT-01 · Signatures avec certificat · différenciation | Signer et vérifier avec un certificat local, si la demande est confirmée | Autorisation d’une dépendance majeure, politique de confiance, qualification multi-OS et lecteur indépendant | 3/4/1/4 | XL · P3 |
| ACCESS-01 · Préservation des structures d’accessibilité du PDF · différenciation | Conserver l’ordre de lecture et les structures lors d’éditions bornées | Audit initial avec un validateur indépendant. Valeur élevée pour certains usages, couverture du pipeline inconnue | 3/4/1/2 | XL · P3 |

## 6. Top 5 recommandé

1. **QUALIF-01**, qualification prioritaire du gate. Fermer la vérification sur
   une VM propre avec l’artefact exact. Les vérifications Auto et poste de
   développement ont déjà borné le problème.
2. **PRIV-01**, gain rapide pour l’information, puis évolution de persistance.
   Publier une explication claire de la copie déchiffrée avant l’ouverture
   et harmoniser le README avant d’ajouter le mode temporaire.
3. **SAVE-01**, chantier de fiabilité. La VM qualifiée et les cas d’erreur
   reproductibles permettent de fiabiliser les destinations et les reprises.
4. **PAGE-01**, chantier structurant. Stabiliser les transitions de plans et
   l’historique pour rendre les opérations existantes réversibles.
5. **PROCESS-01**, gain UX rapide pour l’étiquetage, puis possibilité de traiter
   une composition temporaire après validation de SAVE-01. Le choix explicite
   de la source réutilise la conversion et l’OCR actuels.

## 7. Roadmap par incréments

| Horizon relatif | Incrément testable | Dépendances / décision |
| --- | --- | --- |
| Court, avant une diffusion Preview | QUALIF-01 sur VM clean. Comparer au gate Preview existant et consigner échec/réussite par action | Candidat exact, VM Windows x64 et test sans outils dev. Les règles de MVP_STATUS restent la référence |
| Court, après le gate | Information claire sur PRIV-01 et PROCESS-01. Matrice de destinations et d’erreurs SAVE-01, instrumentation PERF-01 | Libellés testés avec utilisateurs, accès aux mesures natives et confirmation du périmètre de confidentialité |
| Moyen | Session temporaire, historique du plan, conversion/OCR de composition, mesures réelles de mémoire et reprise | PRIV-01 avant toute extension de stockage, SAVE-01 avant PROCESS-01, PAGE-01 avant extraction |
| Moyen, en vue de la diffusion générale | Requalifier PRINT-01 sur WebView2. Stabiliser formats en fonction des corpus observés, puis expérimenter liens/signets et formulaires après organisation | Gates de NEXT_STEPS, VM, résultats PERF-01 et règles déterministes de composition |
| Long | Extraction puis alignement, presets et évaluation des structures PDF/UA. Prototype certificat seulement après validation de la demande | Contrat du plan, qualification et approbation de dépendance pour CERT-01 |

## 8. Tickets proposés

### QUALIF-01 — Installer et qualifier le candidat Preview sur machine vierge

- **Objectif et périmètre** — exécuter le parcours manuel repris dans
  MVP_STATUS sur la VM Windows x64 avec l’artefact et son hash.
- **Hors périmètre** — distribuer une nouvelle candidate, traiter l’impression
  intégrée ou signer l’installeur.
- **Acceptation** — ouverture de fichiers et dialogues natifs, Save As préservant
  la source, OCR hors ligne en eng/fra, fermeture et désinstallation observées.
  Un changement d’artefact redémarre la qualification correspondante.
- **Tests** — gate Preview existant, installation interactive, versions et
  hashes relevés, fermeture et réouverture, contrôles fichiers et processus.

### PRIV-01 — Expliquer et maîtriser la copie temporaire d’un PDF protégé

- **Objectif et périmètre** — montrer la destination de la copie déchiffrée,
  synchroniser l’aide, puis proposer une session temporaire par document.
- **Hors périmètre** — chiffrement d’IndexedDB entier, anonymisation PDF ou
  conservation d’un mot de passe.
- **Acceptation** — choix visible et cohérent au reload. La session temporaire
  ne crée aucune copie restaurable dans IndexedDB. Les préférences et autres
  documents survivent à la fermeture. L’export chiffré reste un choix distinct.
- **Tests** — ouverture, annulation, mot de passe incorrect, reload, erreurs
  d’IndexedDB, fermeture d’un onglet parmi plusieurs, checks du stockage et des
  octets exportés.

### SAVE-01 — Rendre la sauvegarde et l’échec de destination observables

- **Objectif et périmètre** — clarifier Save et Save As, destination active et
  feedback de refus ou annulation. Rejouer transport et réouverture sur le
  paquet qualifié.
- **Hors périmètre** — changer l’encodage de l’export ou relever le plafond
  Preview sans preuve.
- **Acceptation** — la destination choisie reste explicite. Une annulation,
  un échec réseau, un chemin disparu ou un refus d’écrasement laissent le
  document édité et récupérable. Une écriture réussie préserve l’original au
  premier Save As et permet une réouverture correcte.
- **Tests** — unitaires des états de destination, browser downloads, Tauri
  installé avec chemin long, lecture seule, alias de source et fichier proche
  de la limite de taille documentée.

### PAGE-01 — Ajouter l’historique d’organisation des pages

- **Objectif et périmètre** — historiser rotation, duplication, suppression
  et réorganisation dans un plan, avec la sélection de page correspondante.
- **Hors périmètre** — fusion rétroactive entre l’historique d’édition et celui
  du plan, persistance intégrale de l’historique après reload, formulaires
  sur composition multi-source.
- **Acceptation** — séquences undo/redo déterministes y compris entre deux
  documents. Le plan et les miniatures reflètent l’état restauré. Une
  manipulation bloquée et une ouverture de panneau ne créent aucun historique.
- **Tests** — opérations du plan et mutations multi-actions, Ctrl+Z/Y avec
  champ actif, export/réouverture après undo et reprise d’un plan ancien.

### PROCESS-01 — Choisir la version d’entrée d’un OCR ou d’une conversion

- **Objectif et périmètre** — indiquer la source actuelle dans chaque dialogue,
  puis proposer un traitement d’une copie composée lorsque le plan ou les
  edits diffèrent.
- **Hors périmètre** — réécrire le moteur DOCX ou OCR, exporter en lot et
  convertir à distance.
- **Acceptation** — la source reste disponible. La copie inclut les changements
  pris en charge explicitement par le pipeline. En cas d’échec ou d’annulation,
  la copie temporaire est supprimée et le document de travail conserve ses
  éditions.
- **Tests** — route et charge envoyée pour chaque choix, rotation visible et
  texte ajouté dans le résultat, annulation avant et pendant traitement,
  erreurs d’export, changement d’onglet et gestion des budgets.

## 9. Questions ouvertes et choix différés

- Quels parcours sont les plus fréquents parmi l’édition simple, la conversion
  et les dossiers sensibles sur poste partagé ? Observer des scénarios
  reproductibles avec volontaires et documents synthétiques.
- Quelles limites de taille, DPI et délais peut-on afficher avec des preuves
  reproductibles ? Mesurer mémoire et périphériques réels sur les cibles.
- Les utilisateurs traitent-ils les formulaires avant la composition ? Faut-il
  préserver les widgets ou figer explicitement l’apparence pour leur cas ?
- Quel régime de conservation locale est acceptable pour les PDF protégés, et
  quelle information suffit avant l’ouverture ?
- Quel niveau de signature cryptographique et quelle politique de confiance
  locale seraient nécessaires pour un usage réellement identifié ?
- Différer la PAO PDF complète et la promesse de DOCX pixel-perfect. Le contrat
  actuel et les cas complexes documentés ne justifient pas ce chantier.
- Différer une promesse d’anonymisation globale et de conformité PDF/UA avant
  corpus et contrôles indépendants. La visibilité des structures et les tests
  ciblés sont les premiers incréments.
- La synchronisation, les comptes et le traitement serveur distant restent en
  dehors du projet local-first. [Périmètre du projet](../../AGENTS.md)
