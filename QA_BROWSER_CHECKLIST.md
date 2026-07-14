# Checklist navigateur MVP PDF

Date de campagne : `____-__-__`  
Navigateur et version : `________________`  
Système : `________________`  
Résultat global : `[ ] validé  [ ] anomalies consignées`

## Préparation

1. Démarrer le backend et le frontend avec les commandes du README.
2. Ouvrir `http://localhost:5173` dans un navigateur réel.
3. Utiliser les fichiers non privés présents dans `data/input` :
   - `test-01-simple-1-page.pdf` pour les flux simples ;
   - `test-02-multipage-5-pages.pdf` pour les actions de pages ;
   - `test-03-long-20-pages.pdf` pour le défilement et les miniatures ;
   - `test-04-mixed-portrait-landscape.pdf` et `test-05-images-and-text.pdf` pour le rendu varié.
4. Ne pas ajouter de PDF privé au dépôt. Les PDF de `data/input` sont ignorés par Git ; générer localement tout fichier supplémentaire.

## Documents et persistance

### Ouvrir un PDF simple

- Statut : `[ ]`
- Objectif : vérifier l'ouverture et le rendu de base.
- Étapes : ouvrir `test-01-simple-1-page.pdf`.
- Résultat attendu : le document apparaît dans la sidebar, devient actif et sa page est lisible.

### Ouvrir plusieurs PDF et fermer des onglets

- Statut : `[ ]`
- Objectif : vérifier l'état multi-documents.
- Étapes : ouvrir `test-01`, `test-02` et `test-03`, changer de document, fermer un onglet non actif puis l'onglet actif.
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
- Étapes : ouvrir `test-03`, utiliser les boutons de zoom, `Ctrl` ou `Cmd` + molette, les flèches, `PageUp`, `PageDown`, `Home` et `End` quand ils sont disponibles.
- Résultat attendu : zoom et défilement restent fluides ; le focus clavier ne se perd pas ; le retour sur un document conserve sa position.

### Sidebar et thème

- Statut : `[ ]`
- Objectif : vérifier les préférences de l'interface.
- Étapes : masquer puis réafficher la sidebar, basculer clair/sombre, recharger la page et naviguer entre les documents avec le clavier.
- Résultat attendu : les préférences sont conservées et les noms longs restent utilisables avec troncature et intitulé complet accessible.

## Organiser

### Passage lecture/organiser et plan

- Statut : `[ ]`
- Objectif : vérifier la création et la persistance du plan.
- Étapes : ouvrir `test-02`, passer en mode Organiser, vérifier le nombre de pages et l'indicateur modifié, revenir en lecture puis revenir en Organiser.
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
- Étapes : ouvrir `test-02` et `test-03`, organiser `test-02`, ouvrir « Ajouter depuis un PDF ouvert », choisir `test-03`, sélectionner des miniatures puis utiliser « Ajouter les pages sélectionnées ». Répéter avec « Tout ajouter ».
- Résultat attendu : les miniatures et leurs fallbacks se rendent sans bloquer l'interface ; les pages sont ajoutées à la fin dans l'ordre croissant ; leur origine et le récapitulatif des sources sont corrects.

### Fermer une source utilisée

- Statut : `[ ]`
- Objectif : vérifier la protection du plan multi-source.
- Étapes : conserver des pages de `test-03` dans le plan de `test-02`, fermer `test-03`, annuler une fois puis confirmer une seconde fois.
- Résultat attendu : l'annulation conserve la source. La confirmation retire seulement ses pages du plan, met à jour le récapitulatif et ne provoque pas de crash.

## Export

### Export mono-document

- Statut : `[ ]`
- Objectif : vérifier le téléchargement et l'ouverture interne.
- Étapes : organiser `test-02`, exporter avec « Copier aussi dans data/output » décoché.
- Résultat attendu : le bouton affiche l'état en cours, le navigateur télécharge le PDF, un message de succès apparaît et un nouvel onglet interne actif s'ouvre en lecture.

### Export multi-document

- Statut : `[ ]`
- Objectif : vérifier la composition de sources alternées.
- Étapes : créer un plan avec des pages de `test-02` et `test-03`, incluant une page tournée ou dupliquée, puis exporter.
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
