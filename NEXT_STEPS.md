# Next steps

Dernière revue : 2026-10-14

Seule roadmap opérationnelle du dépôt. La dette structurelle est définie dans
[TECHNICAL_DEBT.md](TECHNICAL_DEBT.md), les procédures dans
[QA_AUTOMATION.md](QA_AUTOMATION.md). Une fonctionnalité implémentée peut encore
nécessiter une qualification native ; les items ci-dessous distinguent les deux.

## P0 — Avant release Windows

- [ ] Décider et vérifier la politique de distribution/licences.
  - Pourquoi : aucune décision AGPL/licence commerciale MuPDF/PyMuPDF n'est
    établie ; les notices OCR ne constituent pas une revue du package entier.
  - Critère de sortie : choix de distribution approuvé, obligations de source
    ou licence commerciale vérifiées, inventaire des composants réellement
    distribués et notices transitives contrôlés dans l'installateur final.
    Sources et ressources : [DESKTOP.md](DESKTOP.md#redistribution-et-webview2).
- [ ] Qualifier l'installateur final sur VM Windows réellement clean.
  - Pourquoi : PATH isolé sur poste dev ne prouve pas l'autonomie utilisateur ;
    WebView2 absent/offline et migration d'une version installée restent incomplets.
  - Critère de sortie : VM restaurée sans Node/Rust/Python/OCR système ; installation
    NSIS, lancement menu/raccourci sans console parasite, exports avec polices
    intégrées (écart de résolution décrit dans la dette), OCR eng/fra/mixte offline
    avec correction de rotation, erreurs OCR contrôlées, upgrade avec préférences/données compatibles et
    désinstallation vérifiés. Tester WebView2 absent/corrompu et définir une
    politique offline explicite sans promettre un runtime actuellement non embarqué.
- [ ] Fermer la qualification native des parcours essentiels et de l'affichage.
  - Pourquoi : plusieurs DPI/multi-écran, portrait 1080×1900, impression produite
    et association système ne sont pas validés sur l'artefact final.
  - Critère de sortie : vrais dialogues Open/Save/Save As, annulation/overwrite
    Oui/Non, Unicode/chemin long/lecture seule/destination disparue ; source
    préservée après erreur. PDF protégés : prompt applicatif, annulation/mauvais
    mot de passe/retry, Save As déchiffré et export avec secret indépendant.
    Double-clic et « Ouvrir avec », DPI 100–200 %,
    portrait 1080×1900/work area réelle et transitions multi-écran exercés.
    Export Organiser, AcroForms/markup, conversion UI, présentation et impression
    vers PDF réellement produit contrôlés. Écarts résolus ou support réduit
    explicitement avant release ; aucun statut NT/ENV présenté comme succès.

## P1 — Prochains chantiers produit

- [ ] Étendre l’OCR aux orientations hétérogènes par page et qualifier des scans
  réels inclinés/faible contraste : la correction manuelle globale 0/90/180/270°
  est implémentée sur Web/Desktop et qualifiée sur corpus synthétique Linux.
  Le runtime embarqué n’a pas de deskew ni détection automatique fiable ; aucune
  dépendance supplémentaire n’est justifiée par les mesures actuelles.

## P2 — Qualité / robustesse

- [ ] Requalifier le stress prolongé sur l’artefact WebView2 Windows final :
  reprendre le corpus et les cycles 20 assets de la QA Web, puis mesurer private
  bytes, GPU/RAM, CPU et handles natifs, avec OCR répétés et récupération après
  fermeture. Les profils Chromium/Firefox Linux ne mesurent pas ces ressources.
- [ ] Isoler/corriger la croissance native de recompression PyMuPDF 1.26.3 :
  reproduction autonome sans exporteur applicatif et métriques dans
  [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md#croissance-native-pendant-la-recompression-dimages).
  Qualifier une correction amont ou une isolation bornée avant d’annoncer des
  sessions natives longues sans croissance mémoire ; ne pas masquer avec un
  vidage forcé d’allocateur dans le runtime.
- [ ] Compléter les lecteurs tiers et corpus de compression : QA Linux synthétique
  PyMuPDF/pypdf et DOCX LibreOffice acquise ; Word et Acrobat restent à exercer
  (édition DOCX, AcroForms et annotations conservées/aplaties). Étendre aux photos
  et scans représentatifs autorisés ; les profils ne garantissent pas un fichier
  toujours plus petit pour les scans/transparences déjà compressibles.
- [ ] Planifier une extraction frontend ciblée selon la dette d'orchestration ;
  préserver comportement/styles et rejouer les sentinelles du domaine déplacé.
- [ ] Automatiser la précondition des assets QA d'intégration sur clone neuf,
  selon la dette du runner, pour rendre la campagne complète reproductible.

## P3 — Plus tard

- [ ] Signature cryptographique avec certificat : cadrage PKCS#12, PAdES,
  validation indépendante et packaging crypto dans
  [SIGNATURE_NUMERIQUE_004.md](SIGNATURE_NUMERIQUE_004.md).
- [ ] Étendre le support desktop : installation et QA fonctionnelle Linux/macOS,
  signature Windows/notarisation macOS et stratégie de mises à jour avant de
  promettre ces canaux. Décider le MSI distribué et le qualifier avec droits admin
  s'il devient un canal supporté ; produire un MSI ne valide pas son installation.
- [ ] Décider le routage single-instance des ouvertures OS ; les arguments de
  démarrage sont déjà consommés, un second lancement ouvre actuellement une instance.

## Hors scope / décisions reportées

- Cloud, comptes, collaboration distante et traitement serveur des documents.
- Split avancé, édition arbitraire des objets PDF et DOCX complexe pixel-perfect.
- Magasin de certificats Windows/PKCS#11 et timestamp réseau : décisions séparées.
- Chemins SMB/OneDrive et imprimante physique : environnements QA dédiés avant
  toute promesse de support ; aucune donnée personnelle requise pour les tests.
