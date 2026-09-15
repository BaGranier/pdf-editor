# Checklist navigateur PDF Studio Local

Cette checklist sert aux contrôles humains complémentaires. Elle ne constitue
pas un rapport de campagne et ne doit pas recevoir rétroactivement les résultats
de `QA_BROWSER_REPORT.md` ou de `QA_AUTOMATED_REPORT.md`.

Date de campagne : `____-__-__`  
Navigateur et version : `________________`  
Système : `________________`  
Résultat global : `[ ] validé  [ ] anomalies consignées`

## Préparation

1. Démarrer le backend et le frontend avec les commandes du README.
2. Ouvrir `http://localhost:5173` dans un navigateur réel.
3. Utiliser les fixtures synthétiques de `apps/web/e2e/fixtures` :
   - `pdf-small-1-page.pdf` pour les flux simples et l'édition ;
   - `pdf-small-5-pages.pdf` pour les actions de pages ;
   - `pdf-long.pdf` pour le défilement et les miniatures ;
   - `pdf-landscape-portrait.pdf` pour les orientations mixtes ;
   - `pdf-corrupted.pdf` pour la gestion d'erreur ;
   - `conversion-simple-text.pdf`, `conversion-scan.pdf` et
     `conversion-docx-fidelity.pdf` pour OCR et conversion.
4. Si nécessaire, régénérer ces fixtures avec :

   ```bash
   cd /workspace/services/pdf-engine
   uv run python ../../scripts/generate-qa-pdfs.py
   ```

   Ajouter `--include-large` pour créer localement `pdf-large.pdf`. Ce fichier
   de robustesse de plus de 50 Mo est ignoré par Git.
5. Ne jamais ajouter de PDF privé au dossier de fixtures. Placer les documents
   manuels sous `data/input`, qui est ignoré par Git.

## Documents et persistance

### Ouvrir un PDF simple

- Statut : `[ ]`
- Objectif : vérifier l'ouverture et le rendu de base.
- Étapes : ouvrir `pdf-small-1-page.pdf`.
- Résultat attendu : le document apparaît dans la sidebar, devient actif et sa page est lisible.

### Ouvrir plusieurs PDF et fermer des onglets

- Statut : `[ ]`
- Objectif : vérifier l'état multi-documents.
- Étapes : ouvrir `pdf-small-1-page.pdf`, `pdf-small-5-pages.pdf` et
  `pdf-long.pdf`, changer de document, fermer un onglet non actif puis l'onglet
  actif.
- Résultat attendu : la sidebar conserve les autres documents, un document restant devient actif et aucune erreur ne bloque le viewer.

### Rechargement navigateur

- Statut : `[ ]`
- Objectif : vérifier la restauration locale.
- Étapes : ouvrir deux PDF, modifier le zoom et la position de défilement du premier, recharger, puis revenir au premier document.
- Résultat attendu : les documents disponibles sont restaurés avec le thème, la sidebar, le zoom et la position de défilement. Un document impossible à restaurer produit un message lisible sans crash.

### Réinitialisation locale

- Statut : `[ ]`
- Objectif : vérifier la récupération après une persistance défaillante ou un état obsolète.
- Étapes : cliquer « Réinitialiser les données locales », confirmer, puis recharger la page.
- Résultat attendu : aucun document ni plan n'est restauré ; l'ouverture d'un nouveau PDF fonctionne normalement.

## Viewer et accessibilité

### Zoom, défilement et clavier

- Statut : `[ ]`
- Objectif : vérifier les commandes de lecture dans un navigateur réel.
- Étapes : ouvrir `pdf-long.pdf`, utiliser les boutons de zoom, `Ctrl` ou `Cmd`
  + molette, les flèches, `PageUp`, `PageDown`, `Home` et `End` quand ils sont
  disponibles.
- Résultat attendu : zoom et défilement restent fluides ; le focus clavier ne se perd pas ; le retour sur un document conserve sa position.

### Modes Continu, Page unique et Présentation

- Statut : `[ ]`
- Objectif : vérifier les trois modes de lecture et la conservation de la page active.
- Étapes : ouvrir `pdf-small-5-pages.pdf`, passer du mode Continu à Page unique
  autour de la page 3, utiliser Previous/Next, puis revenir en Continu. Passer
  ensuite en Présentation sans cliquer dans le PDF.
- Résultat attendu : Page unique n'affiche qu'une page avec fit automatique ;
  Continu revient autour de la même page ; Présentation affiche uniquement le
  PDF et son fond, sans compteur ni bouton visible.

### Présentation, fullscreen et raccourcis

- Statut : `[ ]`
- Objectif : vérifier la lecture immersive en portrait et paysage.
- Étapes : avec `pdf-landscape-portrait.pdf`, entrer en Présentation, accepter
  le fullscreen si le navigateur le propose, puis tester `ArrowLeft`,
  `ArrowRight`, `PageUp`, `PageDown`, `Home`, `End`, `Space` et `Escape`.
- Résultat attendu : la page utilise toute la surface compatible avec son ratio,
  reste centrée, les raccourcis changent uniquement la page et `Escape` revient
  à Page unique sur la dernière page affichée. Aucun contrôle visuel ni hitbox
  de navigation ne reste dans la Présentation.

### Netteté HiDPI et ajustement

- Statut : `[ ]`
- Objectif : vérifier le rerendu PDF.js après fit, resize et fullscreen.
- Étapes : sur un écran DPR supérieur à 1 si disponible, utiliser un PDF avec
  texte fin, alterner Page unique, Présentation, `Ajuster`, zoom manuel et
  redimensionnement de fenêtre.
- Résultat attendu : le texte, les lignes, la text layer et les annotations
  restent alignés et ne deviennent pas visiblement flous après un changement de
  fit ou de fullscreen.

### Sidebar et thème

- Statut : `[ ]`
- Objectif : vérifier les préférences de l'interface.
- Étapes : masquer puis réafficher la sidebar, basculer clair/sombre, recharger la page et naviguer entre les documents avec le clavier.
- Résultat attendu : les préférences sont conservées et les noms longs restent utilisables avec troncature et intitulé complet accessible.

## Sauvegarde et édition

### Enregistrer sous

- Statut : `[ ]`
- Objectif : vérifier la sauvegarde des ajouts sans modifier le PDF source.
- Étapes : ouvrir `pdf-small-1-page.pdf`, ajouter un texte et une signature,
  utiliser « Enregistrer sous… », choisir un nom puis télécharger le résultat.
- Résultat attendu : le nom reçoit l'extension `.pdf`, le fichier téléchargé
  contient les ajouts et un nouveau document actif porte le nouveau nom. L'état
  modifié du document source est nettoyé ; ce document reste ouvert et ses
  octets d'origine ne sont pas modifiés.
- Limite attendue : le dialogue choisit le nom, pas un emplacement natif ; la
  destination reste gérée par le navigateur.

### Annuler Enregistrer sous et fermer un document modifié

- Statut : `[ ]`
- Objectif : vérifier la protection des modifications non sauvegardées.
- Étapes : modifier un texte, ouvrir puis annuler « Enregistrer sous… », fermer
  ensuite le document et tester les actions proposées par la confirmation.
- Résultat attendu : l'annulation conserve le texte et l'état modifié. La
  fermeture permet d'annuler, de sauvegarder ou d'abandonner les modifications.

### Édition de texte et historique

- Statut : `[ ]`
- Objectif : vérifier les propriétés et interactions réellement prises en
  charge.
- Étapes : créer un texte, tester Helvetica, Times et Courier, une taille entre
  6 et 144, la couleur et le gras ; déplacer, redimensionner, copier/coller,
  supprimer, annuler puis rétablir.
- Résultat attendu : l'aperçu, le zoom et l'export restent cohérents ; les
  actions restent limitées au document actif.

### Débordement de texte

- Statut : `[ ]`
- Objectif : vérifier qu'un cadre trop petit reste visible et récupérable.
- Étapes : saisir un texte long, réduire son cadre jusqu'à afficher le warning,
  exporter une fois, puis agrandir le cadre et exporter de nouveau.
- Résultat attendu : le débordement est signalé sans bloquer l'export ; le
  premier export indique le rendu best effort et le warning disparaît lorsque
  le texte tient dans le cadre.

### Signature dessinée ou importée

- Statut : `[ ]`
- Objectif : vérifier les deux sources de signature visuelle.
- Étapes : dessiner une signature, puis importer séparément une image PNG ou
  JPEG de moins de 5 Mo ; placer, déplacer, redimensionner et supprimer les
  signatures avant export.
- Résultat attendu : les proportions restent cohérentes au zoom et dans le PDF
  exporté. L'interface rappelle qu'il ne s'agit pas d'une signature
  cryptographique.

## Organiser

### Passage lecture/organiser et plan

- Statut : `[ ]`
- Objectif : vérifier la création et la persistance du plan.
- Étapes : ouvrir `pdf-small-5-pages.pdf`, passer en mode Organiser, vérifier le
  nombre de pages et l'indicateur modifié, revenir en lecture puis revenir en
  Organiser.
- Résultat attendu : la grille est complète, le plan ne se réinitialise pas sans action utilisateur et la barre d'action décrit le PDF final.

### Actions de page et drag-and-drop

- Statut : `[ ]`
- Objectif : vérifier les modifications élémentaires du plan.
- Étapes : sélectionner une page, déplacer par glisser-déposer et avec les icônes, tourner, dupliquer puis supprimer une page.
- Résultat attendu : chaque action est visible immédiatement, l'indicateur modifié apparaît et le nombre final est exact. Un plan vide désactive l'export et propose la réinitialisation.

### Réinitialiser l'organisation

- Statut : `[ ]`
- Objectif : vérifier le retour non destructif au PDF source.
- Étapes : modifier plusieurs pages puis cliquer « Réinitialiser l'organisation ».
- Résultat attendu : le plan revient aux pages originales dans leur ordre, les modifications disparaissent et le document source n'est pas modifié.

### Ajouter des pages externes

- Statut : `[ ]`
- Objectif : vérifier le flux multi-source.
- Étapes : ouvrir `pdf-small-5-pages.pdf` et `pdf-long.pdf`, organiser le premier,
  ouvrir « Ajouter depuis un PDF ouvert », choisir `pdf-long.pdf`, sélectionner
  des miniatures puis utiliser « Ajouter les pages sélectionnées ». Répéter avec
  « Tout ajouter ».
- Résultat attendu : les miniatures et leurs fallbacks se rendent sans bloquer l'interface ; les pages sont ajoutées à la fin dans l'ordre croissant ; leur origine et le récapitulatif des sources sont corrects.

### Fermer une source utilisée

- Statut : `[ ]`
- Objectif : vérifier la protection du plan multi-source.
- Étapes : conserver des pages de `pdf-long.pdf` dans le plan de
  `pdf-small-5-pages.pdf`, fermer `pdf-long.pdf`, annuler une fois puis confirmer
  une seconde fois.
- Résultat attendu : l'annulation conserve la source. La confirmation retire seulement ses pages du plan, met à jour le récapitulatif et ne provoque pas de crash.

## Export

### Export mono-document

- Statut : `[ ]`
- Objectif : vérifier le téléchargement et l'ouverture interne.
- Étapes : organiser `pdf-small-5-pages.pdf`, exporter avec « Copier aussi dans
  data/output » décoché.
- Résultat attendu : le bouton affiche l'état en cours, le navigateur télécharge le PDF, un message de succès apparaît et un nouvel onglet interne actif s'ouvre en lecture.

### Export multi-document

- Statut : `[ ]`
- Objectif : vérifier la composition de sources alternées.
- Étapes : créer un plan avec des pages de `pdf-small-5-pages.pdf` et
  `pdf-long.pdf`, incluant une page tournée ou dupliquée, puis exporter.
- Résultat attendu : le PDF téléchargé et l'onglet interne correspondent au plan, sans modifier les sources ouvertes.

### Copie data/output

- Statut : `[ ]`
- Objectif : vérifier la sortie locale optionnelle.
- Étapes : exporter avec « Copier aussi dans data/output » coché, puis vérifier `/workspace/data/output`.
- Résultat attendu : le téléchargement reste disponible ; le message confirme la copie ou affiche un avertissement non bloquant si elle échoue. Un conflit de nom reçoit un suffixe sûr.

### Erreurs d'export

- Statut : `[ ]`
- Objectif : vérifier les erreurs réseau et de validation.
- Étapes : arrêter temporairement le backend, tenter un export, puis redémarrer le backend. Tester aussi un plan vide ou une source retirée.
- Résultat attendu : le message explique la cause, aucun nouvel onglet exporté n'est créé en cas d'échec et l'application reste utilisable.

## OCR et conversion

### OCR d'un scan

- Statut : `[ ]`
- Objectif : vérifier la production d'un PDF recherchable local.
- Étapes : ouvrir `conversion-scan.pdf`, lancer l'OCR en anglais avec le
  redressement activé.
- Résultat attendu : l'état d'attente est visible, le PDF source reste ouvert et
  un nouveau document `conversion-scan_OCR.pdf` est ouvert puis persisté. Son
  texte contient le témoin `SCANNED OCR WITNESS`.
- Prérequis : OCRmyPDF, Tesseract anglais, Ghostscript et QPDF disponibles sur
  la machine qui exécute le backend.

### Conversion DOCX

- Statut : `[ ]`
- Objectif : distinguer les modes éditable et fidèle visuellement.
- Étapes : convertir `conversion-docx-fidelity.pdf` dans les deux modes, avec un
  nom de sortie personnalisé, puis ouvrir les DOCX obtenus.
- Résultat attendu : le mode éditable contient des éléments modifiables avec une
  mise en page potentiellement approximative ; le mode visuel contient une
  image par page et privilégie l'apparence. Le PDF source reste ouvert.

### Conversion TXT, HTML, PNG et JPEG

- Statut : `[ ]`
- Objectif : vérifier les formats et options exposés.
- Étapes : convertir `conversion-simple-text.pdf` en TXT et HTML ; convertir
  une page puis plusieurs pages en PNG et JPEG en variant résolution, qualité et
  plage de pages.
- Résultat attendu : TXT est en UTF-8, HTML est autonome, une image seule est
  téléchargée directement et plusieurs images sont regroupées dans un ZIP. Le
  nom et l'extension suivent le format réellement produit.

### Modifications non exportées

- Statut : `[ ]`
- Objectif : vérifier l'avertissement avant OCR ou conversion.
- Étapes : modifier le plan de pages ou ajouter un objet, puis ouvrir le dialogue
  OCR ou conversion sans exporter.
- Résultat attendu : le dialogue prévient que le PDF source sera utilisé et que
  les modifications non exportées ne seront pas incluses.

## Desktop

### Backend local et diagnostic de démarrage

- Statut : `[ ]`
- Objectif : vérifier le parcours Tauri sans modifier le parcours web.
- Étapes : sur une machine équipée des prérequis de `DESKTOP.md`, lancer
  `npm run desktop:dev`, contrôler l'ouverture de la WebView puis tester le
  redémarrage du backend depuis un état d'erreur simulé.
- Résultat attendu : Tauri choisit un port loopback dynamique, attend `/health`
  et transmet l'URL au frontend. Une erreur affiche un diagnostic et le chemin
  du journal au lieu d'une fenêtre blanche.
- Limite attendue : ce contrôle valide le mode développement, pas un installateur
  utilisateur autonome ni l'intégration « Ouvrir avec » du système.

## Limites et fichiers invalides

### PDF long ou volumineux

- Statut : `[ ]`
- Objectif : mesurer le comportement dans les limites MVP.
- Étapes : ouvrir un PDF de plus de 250 pages ou de plus de 50 Mo si un fichier de test local non privé est disponible ; ouvrir plus de huit documents si la machine le permet.
- Résultat attendu : un avertissement recommandé apparaît, sans blocage forcé. Noter la fluidité, la mémoire observée et toute erreur de quota IndexedDB.

### PDF invalide ou corrompu

- Statut : `[ ]`
- Objectif : vérifier l'échec de PDF.js.
- Étapes : sélectionner un fichier avec extension `.pdf` mais contenu invalide, généré localement si nécessaire.
- Résultat attendu : un message indique que le PDF ne peut pas être ouvert ; les documents déjà ouverts restent accessibles.

## Rapport d'anomalie

Pour chaque anomalie, relever le navigateur, le système, le fichier de test, les étapes précises, le résultat observé, le résultat attendu et une capture si elle ne contient aucune donnée privée.
