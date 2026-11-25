# Biffage sécurisé et tampons

## Inspection et architecture

Les objets d’édition sont persistés avec le document. Les zones groupées partagent
une étape d’annulation et de rétablissement. Le viewport PDF.js convertit les
coordonnées écran en points PDF, indépendamment du zoom et de la rotation.

## Biffage

« Biffer » permet de tracer une zone, de sélectionner du texte ou de rechercher
des occurrences. Les zones validées s’affichent en noir. La suppression du contenu
intervient lors de la génération du PDF. Sur Desktop, les trois commandes de
sauvegarde demandent une destination distincte lorsque le document est biffé.

Le moteur applique le biffage après la composition et les éditions. Il supprime le
texte, remplace les pixels concernés et retire les tracés vectoriels intersectés
dans leur intégralité. Il supprime aussi les annotations et liens touchés. Il
nettoie les ressources, réécrit le fichier dans son intégralité et rouvre le PDF
pour rechercher du texte résiduel dans les zones. Une erreur arrête la génération.

Le moteur refuse les PDF réparés ou chiffrés, les formulaires, les signatures,
les calques, les représentations alternatives et les pièces jointes. Sur le
parcours vectoriel, les images partagées, inline ou masquées touchées peuvent
être refusées. Le biffage porte sur les zones choisies.
Les informations situées ailleurs dans le document peuvent rester dans la copie.

### Form XObjects

Un Form XObject contient du contenu graphique réutilisable. La version de
PyMuPDF verrouillée sait modifier certaines utilisations, mais la présence
d’une copie dans une autre ressource rend le contrôle du texte extrait de la
page insuffisant. Le moteur vérifie les enveloppes transformées des placements.
Il conserve le parcours vectoriel si les zones restent hors des enveloppes.

En cas d’intersection, le moteur reconstruit à 200 dpi les pages touchées et
celles qui partagent les ressources à retirer. Il écrase les pixels protégés
avant d’intégrer l’image. Le moteur remplace les flux et ressources de page,
supprime les objets devenus inaccessibles, puis compare les pixels intégrés
et recherche les anciens flux décompressés. Les autres occurrences restent
visibles. Les pages reconstruites perdent leur couche de texte et leur
accessibilité textuelle. La sauvegarde indique les numéros de ces pages.
Les annotations et liens hors zone sont conservés selon la politique
d’export. Les pages trop grandes ou les ensembles au-delà du budget sont
refusés. Exportez alors un ensemble de pages plus petit.

## Qualification

Les fixtures sont créées en Python, sans documents personnels. Les tests rouvrent
la sortie et contrôlent extraction/recherche, pixels, dessins, ressources d'images,
objets et flux décodés ainsi que les octets et les anciennes révisions incrémentales.
Les contrôles de chaîne sentinelle, seuls, ne constituent pas une preuve générale
contre toutes les représentations/encodages possibles d'une information. Les
structures refusées restent à qualifier séparément avant élargissement du support.

## Tampons

Galerie française : APPROUVÉ, REFUSÉ, BROUILLON, CONFIDENTIEL, COPIE, REÇU.
Choisir un libellé personnalisé et éventuellement une date UTC, figée à l'insertion,
puis cliquer sur la page. L'inspecteur permet de modifier le texte, la police standard
(Helvetica, Times, Courier, avec repli écran explicite), la taille, l'alignement,
la couleur, le cadre, l'opacité et la rotation. Déplacement et dimensions utilisent
les poignées existantes ; les propriétés continues partagent une entrée d'historique.
Le texte est limité à 200 caractères Latin-1 imprimables (sans € ni Œ) et aux lignes
explicites : aucun retour automatique à la ligne. Si le texte dépasse le cadre,
l'export est refusé avec une invitation à agrandir le cadre ou réduire la police.
Le contenu tourné est ajusté proportionnellement à l'intérieur du rectangle PDF.
Les métriques des polices écran de repli peuvent différer légèrement du PDF standard.

PNG transparent et JPEG locaux sont acceptés, avec contrôle du MIME réel/dimensions
avant décodage et validation backend. Budget existant : 32 Mio compressés par image,
40 Mpx, 20 000 pixels par axe ; budgets de session 512 Mio RGBA et 192 Mio encodés.
Le bouton image place le tampon sur la page active ; on peut ensuite le déplacer.
SVG et ressources réseau ne sont pas acceptés. Les images utilisent le même store
IndexedDB que les images/signatures existantes ; références conservées pendant
undo/redo et nettoyage des ressources orphelines lors des sauvegardes/suppressions.
Pas de nouveau format de base ni de migration des anciens documents nécessaire.

Les objets du document survivent au rechargement. Une bibliothèque personnalisée
globale entre documents reste une amélioration ultérieure (les objets peuvent être
copiés/collés dans la session). Les tampons exportés sont du contenu de page
imprimable : texte vectoriel ou bitmap embarqué, sans annotation masquable. Ils
restent éditables dans le travail original, mais la copie rouverte n'importe pas
ces marquages comme objets de tampon éditables. Un tampon n'est ni une signature
électronique ni une certification. Les PDF avec signatures/champs de signature
sont refusés lors d'un export avec tampon pour éviter toute invalidation silencieuse.

La protection desktop du biffage demande explicitement à Rust de refuser une
nouvelle destination correspondant à un PDF déjà enregistré dans son registre de
sources/destinations, y compris les alias résolus par canonicalisation.

## Évolution : palette et taille automatique des nouveaux tampons

Les nouveaux tampons texte utilisent un style versionné : texte et bordure liés
à la couleur principale, fond de même teinte à 10 %, opacités individuelles et
globale, option Aucun fond et couleurs déliables dans Style avancé. L'alpha global
multiplie une seule fois les alpha des primitives. Aucun recoloriage des images.
Les anciens objets sans `layoutVersion` gardent le rendu historique ; le bouton
« Adopter le style harmonisé et la taille automatique » est une conversion explicite.

La taille automatique utilise les avances et les boîtes d'encre de chaque glyphe,
les lignes explicites, les deux dimensions, la bordure et les marges. Le texte est
centré visuellement avant rotation ; les glyphes ne sont pas étirés. Le mode manuel
signale les débordements et l'export les refuse. Les très petits cadres peuvent
produire une police inférieure à 6 points en mode automatique, sans découpe cachée.

Le style nouveau emploie les polices existantes Noto Sans, Liberation Serif et
Liberation Mono (respectivement sous les choix Helvetica, Times, Courier).
Le viewer charge les mêmes fichiers que le backend. Les métriques frontend sont
générées par `scripts/generate-stamp-metrics.py` depuis ces fichiers ; un test
compare chaque métrique aux polices réellement utilisées à l'export. L'ancien
texte des limites de taille fixe ci-dessus ne concerne plus ce style nouveau.

## Rechercher et biffer

« Rechercher et biffer… » permet de choisir la casse, les mots entiers, la portée
et les occurrences. La validation groupée crée une seule entrée d’historique.
L’index conserve les coordonnées des glyphes natifs, du texte ajouté ou modifié
et de l’OCR des zones visuelles. L’interface indique la progression et les pages
où la reconnaissance est à vérifier ou a échoué. Les recherches successives
réutilisent l’index du fichier ouvert et les changements de texte réindexent les
pages éditées. La couche OCR ajoutée pour la recherche reste dans l’index local.

« Sélectionner le texte à biffer » permet de glisser sur un passage ou de
double-cliquer sur un mot dans une page indexée, puis de le biffer ou de le
commenter. Dans le mode Sélection, la barre
du texte natif propose également « Biffer » et « Commenter ». Un commentaire
ancré est conservé dans le PDF sous forme d’annotation de surbrillance avec note.

L’index accepte les PDF jusqu’à 100 Mio et 2 000 pages. Une opération de biffage
accepte jusqu’à 2 000 zones. Les accents restent significatifs. La reconnaissance
se limite aux langues française et anglaise disponibles et porte sur les images
présentes dans le PDF source.
