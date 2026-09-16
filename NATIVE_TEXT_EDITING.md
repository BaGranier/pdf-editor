# Édition du texte PDF natif et polices

## Deux modèles de texte

Un `AddTextEdit` est un nouvel objet créé par l'utilisateur. Un
`NativeTextEdit` remplace un span homogène déjà présent dans le content stream
du PDF. Les deux partagent `AddTextStyle` et le même registre de polices, mais
le texte natif conserve aussi un objet `source` immuable : texte, bbox et
baseline en coordonnées PDF, police, taille, couleur, rotation et fingerprint.

La page visible est indexée seulement à l'activation de **Modifier le texte**.
`POST /pdf/native-text` utilise PyMuPDF 1.26.3 et le résultat est mis en cache
par fichier et numéro de page dans `pdf/nativeText.ts`. Ouvrir un document ne
parse donc pas toutes ses pages. Les coordonnées écran ne sont jamais
persistées : `PageViewport` transforme les rectangles PDF pour les hitboxes et
l'éditeur DOM.

Un clic sélectionne sans mutation. Double-clic ou Entrée ouvre le brouillon.
Escape l'abandonne; Ctrl/Cmd+Entrée ou **Valider** crée une seule mutation du
reducer. Undo/redo, dirty state et la persistance IndexedDB des remplacements
natifs utilisent les mécanismes documentaires existants.

## Ciblage, aperçu et export

Le fingerprint SHA-256 est calculé par le backend sur la page source, les
indices block/line/span, le texte normalisé, la bbox quantifiée, la police, la
taille et l'orientation. À l'export, la page est ré-extraite. Une cible absente,
ambiguë, déplacée ou dont le texte a changé produit une erreur 409; aucun autre
span n'est choisi par approximation.

La suppression repose exclusivement sur l'API publique de redaction de
PyMuPDF : remplissage transparent, `PDF_REDACT_IMAGE_NONE`,
`PDF_REDACT_LINE_ART_NONE` et `PDF_REDACT_TEXT_REMOVE`. Elle retire les glyphes
ciblés sans rectangle blanc, sans rasteriser la page et sans supprimer les
images ou dessins qui intersectent la bbox. Le texte est réinséré à sa baseline
avec une ressource réellement exportable. Le PDF final reste vectoriel et le
texte est extractible.

Pendant l'édition, `POST /pdf/native-text/preview` rend une page temporaire par
le même pipeline. Cette image n'est qu'un aperçu isolé au-dessus du canvas; le
document source et l'export restent vectoriels. Cela évite le doublon entre le
texte peint dans le canvas PDF.js et le textarea, y compris sur une image ou un
fond coloré.

Les écritures verticales, transformations non orthogonales et couches OCR
invisibles sont signalées comme non éditables. Les rotations orthogonales sont
prises en charge. Il n'y a pas de reflow des objets voisins ni de retouche des
pixels d'un scan.

## FontRegistry

`fonts/catalog.ts` définit les identifiants persistants et
`fonts/fontRegistry.ts` est l'unique point de chargement navigateur. Les objets
historiques `Helvetica`, `Times` et `Courier` sont migrés à la lecture vers des
références `pdf-standard:*`. Les appels `FontFace` sont dédupliqués et lancés à
la demande.

Les 20 familles hors ligne se trouvent dans `apps/web/public/fonts`. Le backend
lit exactement les mêmes fichiers. Les faces distribuées sont Regular
uniquement; l'interface ne synthétise donc pas gras ou italique pour ces
familles. Les notices et la mesure exacte de taille sont dans
`public/fonts/NOTICE.md`. Le catalogue ajoute 10,710,141 octets (10,21 MiB) aux
assets web et au payload web desktop, sans chargement eager.

### Ajouter une police intégrée

1. vérifier la licence et le droit de redistribution;
2. ajouter le TTF/OTF dans `apps/web/public/fonts`;
3. ajouter la face dans `fonts/catalog.ts` et `BUNDLED_FONT_FILES` côté backend;
4. ne déclarer que les poids/styles réellement présents;
5. mettre à jour `public/fonts/NOTICE.md` et joindre la licence;
6. compléter le test de catalogue frontend et le test d'export backend;
7. vérifier web et desktop puis mesurer `du -ch public/fonts/*` et `du -sh dist`.

## Polices personnalisées

Dans l'inspecteur : **Police → + Ajouter une police… → choisir un `.ttf` ou
`.otf` → sélectionner la police**. L'import vérifie signature et limite de
20 MiB, calcule SHA-256, déduplique et stocke le Blob dans IndexedDB. Importer
la ressource seule ne modifie pas le document. Une police référencée par un
document ouvert ne peut pas être supprimée avant remplacement.

L'export joint seulement les fontes `custom:*` utilisées. Le backend vérifie
format, taille, hash et identifiant avant de passer le buffer à PyMuPDF. Aucun
chemin absolu utilisateur n'est sérialisé et aucun fichier temporaire persistant
n'est créé.

Une fonte source embarquée est réutilisée si son programme est extractible et
couvre tous les caractères. Sinon l'UI indique Noto Sans comme fallback
explicite. Le backend refuse tout glyphe absent avec un message demandant une
autre police; il ne produit pas silencieusement de tofu.

## Limites connues

- shaping complexe et scripts nécessitant un moteur de composition avancé;
- fontes variables personnalisées, collections TTC et subsetting optimisé;
- texte arbitrairement transformé;
- regroupement sémantique de spans en paragraphes et reflow global;
- détection d'un texte opaque recouvert plus tard dans le content stream.
