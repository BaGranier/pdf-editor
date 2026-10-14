# Dette technique active

Ce document décrit les contraintes structurelles. Les priorités produit,
qualifications et gates de release sont uniquement dans [NEXT_STEPS.md](NEXT_STEPS.md).

## Orchestration frontend et styles

`apps/web/src/App.tsx` et `App.css` concentrent encore l'orchestration des outils,
dialogues, sauvegarde/export, OCR/conversion et layout. Les modules documentaires,
recherche et composants extraits ne suppriment pas ce couplage.

Extraire progressivement un domaine à la fois, avec ses styles, sans changement
fonctionnel ni visuel associé. Conserver les tests du domaine et la gate
transverse de [QA_AUTOMATION.md](QA_AUTOMATION.md). Le découpage du bundle et
le poids du worker PDF.js demandent une mesure avant optimisation.

## Copies et rétention documentaire

PDF.js charge les documents ouverts en mémoire ; IndexedDB conserve leurs octets
intégraux. La fenêtre de rendu Continu et les buffers mono-page bornent les
canvases, sans borner toute la RAM/GPU. Les exports ouverts consomment aussi des
ressources jusqu'à fermeture.

Les assets dédupliqués peuvent rester référencés par undo/redo et presse-papiers.
Le pruning existant respecte ces usages ; les budgets compressés/RGBA ne sont
pas des seuils de mémoire totale. Toute optimisation doit distinguer une référence
encore utile d'une fuite et préserver undo/redo. Le protocole de mesure est dans
[QA_AUTOMATION.md](QA_AUTOMATION.md).

## Croissance native pendant la recompression d’images

Le runtime verrouillé PyMuPDF 1.26.3 présente une croissance RSS reproductible
sur exports Équilibré/Taille réduite répétés, avec heap Python presque stable
et quatre descripteurs Linux. Sur le corpus de 20 assets, six cycles Équilibré
isolés sans rendu donnent ≈116→197 Mo après GC, vidage du store et diagnostic
`malloc_trim` ; Qualité maximale reste ≈114 Mo. Un appel direct
`Document.rewrite_images` sur une seule image, sans exporteur applicatif,
reproduit ≈0,38 Mo supplémentaires par itération. Ce constat ne prouve pas une
rétention de `PdfEdit[]`, ni un problème de handles Windows.

Reproduire avec `scripts.profile-editor-robustness --native-rewrite-only` et les
options documentées dans [QA_AUTOMATION.md](QA_AUTOMATION.md). `TOOLS.store_size()`
retourne `None` dans ce wheel : aucune taille de cache n’est inventée. Isoler la
rétention dans le code natif amont puis qualifier une correction/version compatible
ou une isolation par processus. Aucun vidage forcé d’allocateur, changement de
bibliothèque ou workaround navigateur n’est appliqué au runtime sur ce seul constat.
Les métriques et PDF synthétiques restent dans les sorties ignorées.

## Contrats interlangages

Les clients TypeScript et schémas Pydantic sont maintenus séparément, avec un
risque de divergence. Un schéma générant les contrats pourrait réduire ce coût
lorsque deux consommateurs en bénéficient. `packages/shared` ne doit pas contenir
une duplication manuelle de modèles. Compatibilité actuelle :
[DEVELOPMENT.md](DEVELOPMENT.md).

## Résolution des polices intégrées dans le sidecar

Écart statique à reproduire sur installation : `app/main.py` résout
`BUNDLED_FONT_DIR` depuis `PROJECT_ROOT/apps/web/public/fonts`, tandis que
`scripts/build-backend-sidecar.py` ne déclare que les ressources OCR dans
`--add-data`. La copie des fonts par Vite ne fournit pas ce chemin au backend gelé.
Un export avec une famille intégrée peut donc échouer alors que l'aperçu Web
fonctionne. Qualifier sans dépôt source ; définir ensuite une ressource packagée
et sa résolution explicite, avec notices et test du sidecar. Aucun correctif
fonctionnel apporté par l'audit documentaire.

## Génération des fixtures d'intégration QA

`scripts/run-qa.py` appelle `generate-qa-pdfs`, mais pas
`generate-clean-integration-fixtures`. Les tests `clean-integration.spec.ts`
attendent des assets ignorés sous `data/output/windows-qa-004/fixtures`.
Une campagne sur clone neuf nécessite donc une préparation manuelle documentée
dans [QA_AUTOMATION.md](QA_AUTOMATION.md). Rendre cette précondition automatique
dans un chantier distinct, sans versionner les gros assets.

## Fidélité du texte natif

Le remplacement est limité aux spans homogènes et rotations orthogonales.
Shaping complexe, fontes variables/TTC, subsetting optimisé et matrices
arbitraires restent limités par le pipeline actuel ; aucun reflow sémantique
des paragraphes voisins. Éviter les contournements par rasterisation ou masque
opaque. Le contrat et les limites sont dans
[NATIVE_TEXT_EDITING.md](NATIVE_TEXT_EDITING.md).

## Copie de travail des PDF protégés

Les backends d’édition continuent de recevoir des PDF non chiffrés. L’ouverture
protégée authentifie avec PyMuPDF et crée une copie de travail déchiffrée ; aucun
secret n’entre dans les contrats persistés. IndexedDB conserve cette copie comme
les autres documents. Les secrets JavaScript/Python ne peuvent pas être garantis
physiquement effacés de la mémoire : champs et références sont libérés après
utilisation, sans stockage applicatif. Un mode lecture seule respectant chaque
permission PDF séparément demanderait un modèle de capacités dans les outils ;
actuellement, toute restriction d’un outil exposé requiert le mot de passe propriétaire.
