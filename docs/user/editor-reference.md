# Référence de l’éditeur

Pour les PDF protégés, la sauvegarde, le biffage et l’impression, voir les [parcours documentaires](document-workflows.md).

## Liens et vue multipage

En mode **Sélection**, cliquez sur un lien dans la page ou ouvrez **Signets**
au-dessus des miniatures. Les renvois internes rejoignent la page et, si le PDF
l’indique, la position. Les URL HTTP et HTTPS s’ouvrent dans un nouvel onglet web
ou dans le navigateur système sur desktop. Les autres protocoles et les actions
PDF de lancement ou de script sont ignorés.

Dans **Texte → Lien**, tracez une zone ou cliquez sur un lien à modifier.
Le menu de sélection de texte permet aussi de créer un lien sur plusieurs lignes.
L’inspecteur enregistre une URL ou un renvoi vers une page source. Les destinations
nommées et certains types de liens restent consultables en lecture seule. Si une
réorganisation supprime la cible d’un lien d’origine, l’export omet ce lien.
Une cible manquante pour un lien édité déclenche une erreur à corriger avant export.

**Double page** dispose deux pages par rangée et centre la dernière page si le
nombre de pages est impair. **Multipage automatique** place autant de pages que
le permettent la largeur disponible, leurs dimensions et le zoom PDF. Les deux
vues utilisent les mêmes miniatures, outils et coordonnées PDF. Le zoom peut
descendre à 25 %.

## Interface et navigation

Le sélecteur **Thème de l’interface** propose Clair, Sombre, Océan, Forêt,
Prune et Sable. Les pastilles montrent la palette en cours. Le choix s’applique
immédiatement et est mémorisé localement. Les couleurs du document et de ses
annotations restent celles du PDF et des réglages d’édition.

Les sept icônes de la barre gauche ouvrent chacune un panneau temporaire.
Survolez une icône ou atteignez-la avec Tab pour afficher son nom. Ouvrez-la
avec Entrée ou Espace, naviguez dans les sous-outils avec Tab ou les flèches,
puis utilisez Échap pour revenir à l’icône. En fenêtre basse, faites défiler le
rail et le panneau. Si la largeur est très réduite, les libellés passent à la
ligne. Ouvrir un panneau conserve l’outil en cours.

| Catégorie | Sous-outils |
| --- | --- |
| Texte | Ajouter du texte, modifier le texte existant, lien |
| Formes et images | Image, dessin libre, rectangle, carré, ellipse, cercle, ligne, flèche |
| Biffage et tampons | Biffer, rechercher et biffer via l’inspecteur, masquage visuel, filigrane unique ou répété, tampon |
| Signature | Ajouter une signature dessinée ou importée, puis la placer et l’ajuster sur la page |
| Pages | Miniatures, Organiser ou Revenir à la lecture. L’organiseur expose les opérations sur les pages et la composition |
| Conversion | OCR, convertir vers les formats pris en charge, nouveau PDF à partir d’images |
| Annotations | Ajouter et lister les commentaires. Sélectionnez du texte dans la page pour le surligner, le souligner ou le barrer |

La sélection, l’ouverture, l’enregistrement et l’historique restent dans
l’en-tête. **Fichier** donne accès à l’export et à l’impression expérimentale.
Les onglets changent de document. Le mode de lecture et le zoom restent
disponibles en bas de la fenêtre. Ctrl+F ouvre la recherche.
La [cartographie des anciens accès et l’inventaire des menus](../../docs/QA_THEMES_NAV_OVERLAYS.md)
détaillent les points de contrôle de cette évolution.

## Images comme objets

**Image** insère un PNG ou JPEG local. Les dimensions sont vérifiées avant
décodage : 40 millions de pixels et 20 000 pixels par axe. Le budget de lecture
compressée est 32 Mio par asset, avec 192 Mio compressés et 512 Mio RGBA estimés
pour les assets uniques de la session ; aucune limite de champ multipart à
1 Mio ne s'applique aux nouveaux imports. Les originaux ne sont pas dégradés
systématiquement. L'image est centrée, bornée à 60 % de la page et librement
redimensionnable ; Shift ou **Conserver les proportions** verrouille son ratio.
**Rogner l’image** permet de déplacer/redimensionner un cadre, valider, annuler
avec Escape ou rétablir l'image entière, avec undo/redo. Le crop est non destructif
et persiste avec les documents web restaurables. Les documents natifs ouverts
par identifiant Tauri restent volontairement limités à la session.
Le panneau **Plans des objets ajoutés** permet de
sélectionner un objet couvert et de le placer devant/derrière les autres edits.
Le contenu PDF original reste la base. Carré et cercle gardent une géométrie 1:1 ;
les extrémités du trait/flèche sont déplaçables. Les markups locaux participent
au même ordre que les formes et sont exportés comme vecteurs ; les annotations
déjà présentes dans le PDF source conservent leur comportement PDF.
Les images n'ont pas d'outil de
rotation dédié ; SVG et WebP ne sont pas acceptés.

## Options d’export

**Exporter / Finaliser…** propose :

| Profil | Politique |
| --- | --- |
| Qualité maximale | optimisation des flux/objets sans recompression destructive des images |
| Équilibré | images à haute résolution : cible 180 DPI, seuil 225 DPI, qualité 85 |
| Taille réduite | images à haute résolution : cible 100 DPI, seuil 125 DPI, qualité 65 |

Les images RGB/gris source et ajoutées peuvent être recompressées, une fois par
ressource et selon leur plus grand placement. Masques/transparence, couleurs
complexes et images de plus de 40 millions de pixels conservent leurs données.
Le texte reste sélectionnable et les vecteurs
restent vectoriels. Aucune réduction de taille universelle n'est garantie.
Le rapport affiche les tailles source/export et le profil sans promettre un gain.
Les profils Équilibré/Taille réduite remplacent les images par référence PDF,
sans réécrire les flux de page : le gate 006 a reproduit une corruption des
polices et un sous-échantillonnage répété avec `rewrite_images` de MuPDF 1.26.3.

Les edits ajoutés sont déjà intégrés au PDF. L'aplatissement des **formulaires**
et celui des **annotations** sont deux options explicites : ils conservent leur
apparence et suppriment leur interactivité ; celui des annotations peut perdre
commentaires et pièces jointes. Les annotations sont conservées par défaut.
La protection utilise AES-256, un mot de passe d'ouverture facultatif et des
permissions d'impression/modification avec mot de passe propriétaire distinct.
Ces permissions peuvent être ignorées par d'autres logiciels. Les secrets ne
sont ni persistés ni journalisés. Une sortie chiffrée se rouvre à la demande
dans le dialogue de mot de passe des PDF protégés.

## Limites d'usage recommandées

Le frontend avertit sans bloquer l'ouverture ou l'export au-delà de **50 Mo** par
PDF, **250 pages** par PDF ou **8 documents ouverts**. Ces valeurs sont des
recommandations de mémoire et de quota navigateur, configurables au build par
`VITE_PDF_RECOMMENDED_MAX_SIZE_MB`, `VITE_PDF_RECOMMENDED_MAX_PAGE_COUNT` et
`VITE_PDF_RECOMMENDED_MAX_OPEN_DOCUMENTS`. En cas d'échec IndexedDB, les PDF
peuvent rester ouverts pour la session mais ne seront pas forcément restaurés
après fermeture de l'onglet.

Les fixtures reproductibles versionnées sont dans `apps/web/e2e/fixtures`. Les
documents complémentaires placés dans `data/input` restent locaux et ignorés par
Git. La campagne manuelle est décrite dans
[les contrôles humains de la campagne QA](../qa/QA_AUTOMATION.md#contrôles-humains-et-gates-de-release).

Limites actuelles : pas de split avancé ni d'édition arbitraire des objets PDF
existants. L'édition ajoute des blocs de texte et des signatures lors de
l'export ; elle ne remplace pas une suite PAO complète. La conversion DOCX
reconstruit un document éditable sans garantir une reproduction parfaite des
mises en page complexes.

## Ouvrir et convertir des images

**Ouvrir**, Ctrl+O ou le glisser-déposer dans l’espace de travail acceptent les
PNG, JPEG et WebP statiques. Le navigateur vérifie le contenu du fichier. Le
format et les dimensions orientées sont affichés dans l’inspecteur. Utilisez
**Éditer le fond image** pour pivoter par quarts de tour, retourner, recadrer ou
réinitialiser le fond. Le format de page reste fixe et les annotations gardent
leurs positions. L’historique de la session couvre les transformations et les
annotations.

**Exporter en PDF** produit une copie que l’éditeur ouvre dans un nouvel onglet.
Pour réunir plusieurs images, utilisez **Fichier → Nouveau PDF à partir d’images**.
Réordonnez les miniatures par glisser-déposer ou avec les boutons Monter et
Descendre. Choisissez A4, Lettre ou la taille de chaque image à 96 dpi, puis
l’orientation, les marges, le fond et l’ajustement. Le fond par défaut est blanc
et la mise en page préserve le ratio. Les JPEG sont intégrés sans réencodage à
l’import. Les profils de compression PDF peuvent réencoder les images à l’export.

Le projet conserve l’original et le résultat des modifications dans le stockage
local. Le moteur local reconstruit le PDF de travail pour l’affichage, l’export
et la restauration. Le recadrage et le masquage sont visuels. Des pixels hors
cadre restent récupérables dans le PDF. Le texte photographié reste une image.
Voir [les limites et les résultats de validation](../../docs/QA_IMAGE_DOCUMENTS.md).
