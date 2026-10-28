# Blockers Windows avant diffusion

Ce gate historique vise la diffusion générale. Pour la **Preview MVP Windows**,
le périmètre et les seuls blockers actifs sont dans [MVP_STATUS.md](MVP_STATUS.md).
L'impression intégrée y est expérimentale ; le parcours supporté est Save/Export
puis impression dans un lecteur externe. Linux/macOS restent WIP.

Décision du gate 006 : **NOT READY**. Ne retirer un point qu'après preuve de
fermeture ; un test automatique ou un poste dev ne qualifie pas une VM clean.

- **Redistribution AGPL** : voie approuvée ; préparer la livraison des sources
  correspondantes et les mentions requises, fermer les notices transitives
  MuPDF/codecs, Rust et npm, et vérifier les droits MSVC CRT. Voir la politique
  dans `DESKTOP.md`.
- **VM clean** (`ENV`, aucune VM accessible) : NSIS interactif, raccourcis/menu,
  absence d'outils dev, OCR eng/fra/mixte réseau coupé, WebView2 absent online
  et échec offline lisible, upgrade et désinstallation sans descendants/ports.
- **Fichiers et OS sur l'artefact final** : fermer Save As sur chemin >260 et
  Save volumineux hors compression (blocage avant dialogue reproduit à 25,3 Mo
  sur une candidate intermédiaire), double-clic et « Ouvrir avec ». Overwrite No,
  readonly, destination disparue et récupération Save As ont été exécutés sur
  poste dev ; ils restent à qualifier en VM clean.
- **Affichage et fonctions essentielles** : portrait 1080×1900 mesuré, DPI natifs
  125–200 %, zoom/fit/overlays ; multi-écran `ENV` si indisponible. Fermer la scène
  éditeur complète et la comparaison export/réouverture, conversion/destination,
  impression Windows vers Microsoft Print to PDF avec fichier produit contrôlé.
  Impression `KO` sur le package final : frames PDF chargées après correction
  CSP, mais aucun dialogue Windows ni fichier produit pendant l'essai.

Les preuves, inventaires et matrice détaillée de cette campagne restent ignorés
sous `data/output/release-gate-006/`. Les sujets P1/P2 et structurels restent
dans `TECHNICAL_DEBT.md` et ne font pas partie de cette clôture P0.
