# Biffage sécurisé et tampons

## Inspection et architecture

Inspection initiale : branche `agent/20261116T122234979691Z`, HEAD `293f064`,
worktree propre. Aucun fichier local préexistant à préserver. Aucun nouvel endpoint
ni dépendance. Les objets `PdfEdit` sont persistés avec le document dans IndexedDB ;
`pdfEditsReducer` gère révisions, dirty state et undo/redo. Les déplacements et
redimensionnements utilisent les helpers existants et valident au relâchement.
Le viewport PDF.js convertit les coordonnées écran en points PDF natifs (origine
bas gauche, CropBox comprise), indépendamment du zoom et du DPR. L'export multipart
unique compose les pages, applique les éditions, puis finalise le PDF. Tauri
utilise ce même contrat et les dialogues natifs.

## Biffage

« Biffer » crée des rectangles **en attente**, déplaçables et redimensionnables.
Le biffage ne devient irréversible que dans le PDF exporté. Le texte barré existant
reste un marquage visuel et n'efface aucune donnée. L'export demande confirmation,
et le biffage est appliqué après toutes les éditions, avant compression/chiffrement.
Sur desktop, un biffage passe systématiquement par Enregistrer sous afin de garder
le fichier source. Les zones restent éditables dans l'état de travail original.

PyMuPDF verrouillé en 1.26.3 : `add_redact_annot`, `apply_redactions` avec suppression
du texte, remplacement des pixels d'images, suppression des tracés vectoriels
**touchés** (le tracé entier peut disparaître). Nettoyage des ressources de pages
et réécriture complète `garbage=4, clean=True, deflate=True, incremental=False`.
Aucune rasterisation globale ni sauvegarde incrémentale.

Périmètre conservateur : l'export avec biffage refuse les PDF réparés/chiffrés,
annotations (y compris liens), formulaires et signatures numériques, calques
optionnels, contenu alternatif/tagué, pièces jointes et scripts détectés.
Les images partagées, inline ou avec masque de transparence touchées sont également refusées : une autre
occurrence pourrait exposer les pixels originaux. Les commentaires et deltas de
formulaires ajoutés sont refusés avec un biffage. Les erreurs sont explicites.
Aucune promesse de conserver une signature cryptographique après modification.

Ce n'est **pas une anonymisation globale** : les métadonnées et les informations
ailleurs dans le document ne sont pas effacées. L'utilisateur doit choisir toutes
les zones nécessaires. La sélection native multiligne reste une évolution distincte ;
le MVP utilise le tracé rectangulaire. Agrandir les rectangles pour inclure les
caractères de bordure. Le moteur retire tout caractère dont la boîte intersecte
une zone, et non uniquement sa portion visuelle.

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

Depuis Biffer, « Rechercher et biffer… » partage le matcher et les surbrillances
Ctrl+F : casse, mot entier, page courante ou document, sélection individuelle,
de page ou de toutes les occurrences. Une confirmation précède la création en
masse ; la recherche et les sélections ne rendent pas dirty. La création forme
une seule étape d'historique. Les zones déjà couvertes sont dédupliquées.

La recherche utilise le texte du PDF source, pas les objets ajoutés dans l'éditeur.
NFC et casse Unicode sont gérés ; les accents restent significatifs. Les espaces
et fins de ligne PDF.js sont équivalents pour une expression. Pas de regex, de
recherche multi-termes ni de décomposition automatique des ligatures.
Un scan sans couche texte ne donne aucun résultat : utiliser le biffage manuel ou
l'OCR existant puis rouvrir sa copie. Limite de préparation : 2 000 occurrences/zones.

La nouvelle route locale `/pdf/redaction/resolve` ne réimplémente pas la recherche :
elle vérifie les offsets sélectionnés et l'empreinte SHA-256 de la séquence textuelle
contre les caractères natifs PyMuPDF. Elle produit des rectangles natifs par ligne,
avec marge de 0,5 pt, sans exploiter les rectangles DOM des surbrillances.
Toute divergence d'ordre/d'encodage, géométrie vide ou page invalide fait échouer
le lot entier. Les séquences décomposées complexes et les caractères hors BMP
sont refusés pour cette résolution. Les zones restent ajustables dans le travail.

L'export réutilise la suppression réelle finale et toutes ses restrictions de
sécurité. Cette recherche ne détecte pas tous les secrets, ne garantit pas la
qualité d'une couche OCR et n'anonymise pas les métadonnées ou contenus ailleurs.
