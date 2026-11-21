# Navigation et filigranes

La barre gauche comporte six entrées permanentes, au lieu des quinze outils
indépendants. Documents, recherche Ctrl+F et commandes Fichier restent à leur
emplacement actuel. Aucun menu ne change le zoom ou l’historique PDF.

| Entrée | Commandes existantes |
| --- | --- |
| Sélection | Sélection / déplacement |
| Édition | Ajouter du texte, modifier le texte natif, image, dessin, rectangle, carré, ellipse, cercle, ligne, flèche |
| Annotations | Commentaire, signature ; sélectionner du texte révèle surlignage, soulignement et barré |
| Marquage | Biffer, masquage visuel, filigrane, tampon texte / image |
| Conversion | OCR, convertir |
| Pages | Organisation existante : miniatures, rotation, duplication, suppression, composition |

Marquage ouvre **un seul menu** pour le biffage et les filigranes. Biffer supprime
réellement les données dans la copie exportée. Masques, filigranes et tampons
laissent les données récupérables. Les réglages utilisent l’inspecteur existant.

Les menus sont temporaires, scrollables et positionnés dans le viewport. Tab,
Entrée, flèches, Home/End et Escape permettent leur utilisation au clavier.
Escape rend le focus au parent sans changer l’outil actif. Le parent et le
sous-outil actifs portent une coche ; la sélection ne repose pas sur la couleur.
Ouvrir un autre groupe ferme le précédent. Cliquer dehors ferme le menu.
Les raccourcis applicatifs ignorent les champs éditables.

## Filigrane Unique / Répété

Marquage → Filigrane propose les deux modes dans le même inspecteur. Unique
conserve le rendu historique ; aucun champ de répétition n’est ajouté aux anciens
objets. Répété démarre à 18 pt, −30°, rouge à 25 % d’opacité. Son aperçu se met à
jour après une courte temporisation de saisie, sans enregistrer le document.
Appliquer crée une seule opération d’historique pour toutes les pages ciblées.
Comme auparavant, cette action revient en mode Sélection et sélectionne le
filigrane créé pour afficher ses propriétés. Le parent actif reflète le mode
d’interaction ; ouvrir ou fermer le menu ne le change pas.

Les préréglages Discret / Standard / Dense règlent les deux espacements. Les
réglages fins donnent les écarts horizontal / entre lignes et la phase X/Y en
points PDF natifs. Police, taille, couleur, angle signé et opacité restent
modifiables. Un glissement déplace tout le motif et conserve le cadre de page ;
les variations d’un slider sont regroupées jusqu’à la fin du geste. Les changements
concernent toutes les pages du groupe, avec une grille recalculée pour chacune.
La portée (page, plage, toutes) se choisit lors de la création ; supprimer le groupe
permet de le recréer avec une autre portée.

Le modèle reste `StampEdit`, avec `purpose: "watermark"`, `watermarkMode` optionnel
(`single` par défaut), et `tile` contenant `horizontalGapPt`, `verticalGapPt`,
`offsetXPt`, `offsetYPt`. Une occurrence n’est jamais persistée comme objet.
Le rendu SVG et l’export PyMuPDF utilisent le même plan de répétition mesuré à
partir des polices embarquées. Les cas de référence JSON vérifient les deux
implémentations. La rotation de page PDF.js s’applique après la rotation du motif.
Le clipping s’effectue aux limites de la page / du CropBox après rotation ; les
cellules extérieures calculées couvrent les coins sans fuir sur une autre page.
L’export conserve du texte vectoriel imprimable, avec transparence, sans
rasteriser le document pour le filigrane.

Limites conservées et explicites : polices embarquées de graisse normale,
caractères Latin-1 (sans € ni Œ), marquage au premier plan. Aucune fonction DRM ou
de biffage n’est apportée par le filigrane. L’application avant composition doit
se faire dans chaque document source ; les plans multi-source ou comportant des
pages dupliquées restent refusés par le compositeur de filigranes existant.
Les écarts sont bornés de 8 à 720 pt, les phases de −720 à +720 pt. Un budget de
800 répétitions, 2 400 lignes et 60 000 caractères par page refuse explicitement
les motifs excessifs. Le compteur inclut les cellules partiellement ou totalement
hors du cadre nécessaires au clipping. Les caractères non pris en charge sont
signalés, sans remplacement silencieux.

Sur petit écran, l’inspecteur est un panneau superposé refermable. Les libellés des
catégories restent lisibles. Un brouillon de texte natif non validé bloque le
changement d’outil et demande sa validation ou son annulation ; les modifications
validées et les valeurs de formulaire sont conservées.

Les PDF utilisés par les tests sont synthétiques. Le document personnel évoqué
comme référence visuelle n’est ni importé ni ajouté aux fixtures.
