# Signature cryptographique PDF — périmètre différé

Non implémentée ; priorité et ordre de lancement : [NEXT_STEPS.md](NEXT_STEPS.md).
Une signature manuscrite est une image. AES-256 règle confidentialité/permissions,
et l'aplatissement retire l'interactivité ; aucun ne signe avec un certificat.
Le pipeline actuel compose/finalise le PDF mais n'écrit ni ne valide une
signature CMS/PAdES.

## Périmètre à qualifier avant implémentation

- Sélection locale d'un PKCS#12 (P12/PFX), mot de passe ponctuel ; aucune
  persistance ni journalisation de certificat/secret.
- Composition/finalisation avant signature, écriture incrémentale sur temporaire,
  validation avant destination atomique et préservation de la source.
- Affichage séparé de l'intégrité, de l'identité et du niveau de confiance ;
  définir la politique hors ligne et le niveau PAdES réellement visé.
- Certificats synthétiques : mauvais secret, expiration, altération et changements
  incrémentaux, coexistence formulaires/annotations/chiffrement.
- Vérification indépendante, notamment Acrobat ; distinguer intégrité valide et
  confiance dans le certificat. Une signature ne rend pas le PDF impossible à modifier.
- Audit du graphe crypto verrouillé : licences, sécurité, taille, startup et
  packaging PyInstaller sur chaque OS, puis VM sans outils de développement.

[pyHanko](https://github.com/MatthiasValvekens/pyHanko) est un candidat à réévaluer,
sans version ni dépendance retenue. Demander l'autorisation avant tout ajout de
dépendance majeure, conformément aux règles du dépôt.

Le magasin de certificats Windows, PKCS#11 et l'horodatage réseau/TSA nécessitent
une décision séparée. Aucune requête externe implicite dans le périmètre initial.
Ce chantier n'est pas requis pour la première release Windows.
