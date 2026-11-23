# Ouvrir, protéger et enregistrer un document

## PDF protégés

Le dialogue masque le mot de passe et permet d'annuler ou de réessayer.
Le moteur local vérifie le mot de passe. Le secret ne rejoint ni IndexedDB,
ni les préférences, ni l'historique d'édition. Pour les PDF aux droits restreints,
le mot de passe propriétaire peut être requis pour les outils proposés.

Une ouverture protégée utilise une **session temporaire**. La copie déchiffrée,
ses modifications et ses miniatures restent dans la session. Les copies PDF
rouvertes automatiquement et les sorties OCR héritent de ce mode. Les pages ou
objets protégés restent composables et collables dans des documents temporaires.
Le rechargement rend la copie indisponible. Un enregistrement ou un export
explicitement lancé crée un fichier hors de la reprise automatique.

Pour conserver une copie chiffrée, choisissez **Fichier → Exporter / Finaliser**
et un mot de passe de sortie AES-256. La copie chiffrée se rouvre à la demande
avec son propre mot de passe. Une copie téléchargée ou enregistrée par les
autres commandes est déchiffrée.

Les anciennes données locales ne portent pas de marqueur permettant d'identifier
une copie anciennement déchiffrée. Pour retirer une copie connue, fermez
l'onglet restauré correspondant et confirmez le rejet des éditions si voulu.
Cette fermeture cible son identifiant et les assets devenus orphelins. Quand
un onglet ancien ne peut pas être restauré, le ticket conserve ses données
pour récupération. La fermeture vise le stockage de reprise de l'application
et ne garantit pas l'effacement de la RAM, des sauvegardes système, des fichiers
déjà exportés ou de leurs copies.

## Enregistrement et export

| Action | Navigateur | Desktop Tauri |
| --- | --- | --- |
| Enregistrer | Ouvre Enregistrer sous et propose le nom d'une copie | Le premier Save ouvre le dialogue Save As. Les suivants écrivent atomiquement dans la destination active |
| Enregistrer sous | Produit une copie et demande son téléchargement | Ouvre un dialogue natif pour une nouvelle destination ou un remplacement confirmé |
| Exporter / Finaliser | Produit une copie avec les options choisies | Produit une copie avec dialogue natif. L'export ne change pas la destination active du document source |

Dans le navigateur, un téléchargement demandé et une copie affichée dans
l'éditeur ne prouvent pas l'écriture sur disque. Vérifiez votre fichier, puis
cliquez sur **J’ai enregistré cette copie**. Les modifications restent
signalées jusqu'à cette confirmation et les modifications plus récentes
restent à enregistrer. Si le téléchargement a été annulé ou échoue, gardez
l'onglet et recommencez. Après rechargement, la confirmation en attente est
perdue et les documents restaurables conservent leur état modifié.

Sur Desktop, l'en-tête du document et son état signalent la destination de
session. Le nom seul est visible et le shell natif détient le chemin. Le premier
Save As préserve l'original. Annulation, refus de la destination et erreur de
lecture ou d'écriture conservent l'état modifié. Le plafond Preview de 25 Mio
porte sur le PDF généré. Au-delà, l'application affiche le refus et conserve
la source et les modifications. [Contrat desktop](../architecture/DESKTOP.md#fichiers-et-frontière-ipc)

## Biffage et impression

Le prévol indique les pages de sortie concernées. Le moteur supprime le contenu
visé dans les zones validées ou refuse le biffage si le document ou les zones
sortent du périmètre vérifié. Les informations hors zones et les métadonnées
peuvent subsister. Le masquage visuel, les tampons et les filigranes laissent
le contenu récupérable. [Contrat de biffage](../features/REDACTION_STAMPS.md)

En Preview Windows, exportez la **copie composée** puis ouvrez-la dans un
lecteur PDF externe pour imprimer. L'aperçu intégré est expérimental et la
demande d'un dialogue ne confirme pas une sortie imprimée. [Gate Windows](../product/NEXT_STEPS.md)

## Pages, OCR et conversion

L'historique des objets s'applique au texte, aux formes et aux autres éditions
prises en charge. Les opérations du plan de pages restent hors de cet
historique. Les limites relatives aux formulaires, aux liens et aux signets
restent documentées. [Dette technique](../product/TECHNICAL_DEBT.md)

OCR et Conversion prennent le PDF source de l'onglet actif avant les
modifications et le plan. Pour traiter la composition, exportez-la et ouvrez
la copie avant de lancer le traitement. [Contrat de conversion](../features/CONVERSION.md)
