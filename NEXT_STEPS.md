# Blockers Windows avant diffusion

Décision du gate 006 : **NOT READY**. Ne retirer un point qu'après preuve de
fermeture ; un test automatique ou un poste dev ne qualifie pas une VM clean.

- **Redistribution AGPL** : voie approuvée ; préparer la livraison des sources
  correspondantes et les mentions requises, fermer les notices transitives
  MuPDF/codecs, Rust et npm. Voir la politique dans `DESKTOP.md`.
- **VM clean** (`ENV`, aucune VM accessible) : NSIS interactif, raccourcis/menu,
  absence d'outils dev, OCR eng/fra/mixte réseau coupé, WebView2 absent online
  et échec offline lisible, upgrade et désinstallation sans descendants/ports.
- **Fichiers et OS sur l'artefact final** : compléter les essais par dialogues
  natifs (overwrite No, chemins >260, readonly, destination disparue, récupération
  Save As), double-clic et « Ouvrir avec » ; préserver les sources après erreur.
- **Affichage et fonctions essentielles** : portrait 1080×1900 mesuré, DPI natifs
  125–200 %, zoom/fit/overlays ; multi-écran `ENV` si indisponible. Fermer la scène
  éditeur complète et la comparaison export/réouverture, conversion/destination,
  impression Windows vers Microsoft Print to PDF avec fichier produit contrôlé.

Les preuves, inventaires et matrice détaillée de cette campagne restent ignorés
sous `data/output/release-gate-006/`. Les sujets P1/P2 et structurels restent
dans `TECHNICAL_DEBT.md` et ne font pas partie de cette clôture P0.
