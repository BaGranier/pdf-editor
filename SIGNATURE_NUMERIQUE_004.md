# SIGNATURE-NUMERIQUE-004 — Certificat utilisateur et vérification indépendante

État : sous-ticket proposé, non implémenté. Audit initial du 2026-10-08.
Issu de EDITOR-FEATURES-EXPORT-PRESENTATION-003.

## Pourquoi le ticket 003 s'arrête avant la signature cryptographique

PyMuPDF présent dans le dépôt permet la composition, les permissions AES et
l'aplatissement ; le pipeline actuel n'a pas de composant qui signe avec P12/PFX
et valide de manière indépendante l'intégrité et les modifications postérieures.
Aucune signature numérique n'est simulée avec une image. Les signatures
manuscrites existantes restent des images graphiques.

Une signature CMS/PAdES fiable exige une nouvelle dépendance crypto, une politique
de confiance hors ligne, des tests de modifications postérieures et la validation
des ressources PyInstaller sur les trois OS. Ces preuves et l'autorisation d'une
nouvelle dépendance majeure manquent. L'export/finalisation/chiffrement du ticket
003 est livré séparément et n'est pas bloqué par cet audit.

## Candidat et audit initial

| Sujet | Observation / preuve à compléter |
| --- | --- |
| Candidat | pyHanko, bibliothèque dédiée aux signatures PDF |
| Licence | MIT ; vérifier aussi les licences de toutes les dépendances retenues |
| Maintenance | PyPI publie 0.37.0 le 31 août 2026 ; une publication récente ne suffit pas à garantir la maintenance future |
| Taille | wheel 0.37.0 de 477,3 ko ; archive source d'environ 8 Mo. Ces tailles excluent le graphe crypto et ne mesurent pas le sidecar final |
| Python / OS | Python >= 3.10 et wheel indépendante de l'OS ; le moteur actuel utilise Python >= 3.11. Les dépendances natives et les bundles Windows/Linux/macOS restent à qualifier |
| API | `SimpleSigner.load_pkcs12` et écriture incrémentale documentées ; validation des signatures et classification des changements documentées |
| Sécurité | audit des versions transitives, vulnérabilités, traitement P12 malformé, limites taille/temps et secrets à réaliser avant choix de version |
| Packaging | collecter crypto, données de confiance et imports nécessaires dans PyInstaller, mesurer taille/startup ; tester sans Python/outils de développement sur VM propre |
| Vérification | validateur indépendant requis ; confiance locale, certificats expirés, signature altérée, changements incrémentaux à tester |

Sources primaires consultées :

- [PyPI pyHanko : versions, licence, plateformes et distributions](https://pypi.org/project/pyHanko/).
- [Guide officiel de signature](https://github.com/MatthiasValvekens/pyHanko/blob/master/docs/lib-guide/signing.rst).
- [Guide officiel de validation](https://github.com/MatthiasValvekens/pyHanko/blob/master/docs/lib-guide/validation.rst).
- [API PyMuPDF Document : composition, bake et sécurité](https://pymupdf.readthedocs.io/en/latest/document.html).

Aucune dépendance ajoutée au ticket 003. Il faut auditer un graphe verrouillé
précis, puis demander l'autorisation avant l'ajout majeur.

## Périmètre proposé

1. Sélection locale d'un PFX/P12 et saisie ponctuelle de son mot de passe.
2. Composition/finalisation complète avant signature ; signature sur temporaire,
   validation avant destination atomique, préservation de la source.
3. Aucune persistance du certificat/secret, aucun log du mot de passe,
   aucune requête externe implicite. Effacer les références après tentative.
4. Afficher séparément intégrité, identité/certificat et niveau de confiance.
   Définir sans ambiguïté ce qui est vérifié hors ligne et ce qui ne l'est pas.
5. Tests de certificat synthétique, mauvais mot de passe, certificat expiré,
   altération du contenu, modification incrémentale détectée après signature,
   coexistence formulaires/annotations/chiffrement.
6. Vérification indépendante avec outil choisi explicitement et reproductible ;
   qualification du sidecar PyInstaller Windows, Linux et macOS.

Hors périmètre initial : magasin de certificats Windows, PKCS#11, infrastructure
entreprise et horodatage réseau automatique. Une signature atteste principalement
intégrité/authenticité ; elle ne rend pas un PDF impossible à modifier.

Validation Windows native : NON RÉALISÉE / À REQUALIFIER.
