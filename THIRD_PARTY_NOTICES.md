# Redistribution — preuves et notices

L'inventaire composant par composant est généré, versionné par les hashes du
manifest et installé sous `licenses/redistribution/THIRD_PARTY_NOTICES.md`.
Son `inventory.json` contient versions, rôles, licences, URLs upstream, formes
redistribuées, chemins des notices, sources requises et statuts.

Les paquets npm sont sélectionnés depuis les modules réellement rendus par
Rollup et le worker PDF.js comparé octet pour octet. Le graphe Rust Windows est
croisé avec les fichiers `.d` de compilation release : c'est une couverture
conservatrice du code lié/généré, pas une affirmation que chaque fonction survit
au linker. Les sources de ces crates sont jointes, notamment pour le MPL-2.0.
Les packages Python proviennent d'Analysis PyInstaller ; l'inventaire natif
compare les données/DLL de PKG avec le sidecar réel.

Le package contient CPython 3.11.9, PyMuPDF/MuPDF 1.26.3, Tesseract/Leptonica
intégrés et eng/fra/osd verrouillés ; OCRmyPDF, Ghostscript, QPDF CLI et LibreOffice
ne sont pas distribués. Les fontes et leurs licences sont dans `fonts/`.
Le build conserve les notices runtime et ajoute les notices natives de la source
MuPDF complète, celles de NSIS 3.11 et celles des dépendances frontend/Rust.

## Dossier restant : payload natif Windows

Statut **NEEDS_REVIEW**, redistribution bloquée :

- `mupdfcpp64.dll` : sources upstream 1.26.3 complètes fournies, mais le jeu exact
  des bibliothèques statiques/options du wheel n'est pas prouvé par les imports PE.
  Obtenir/rapprocher la configuration native du wheel avec ses sources vendored,
  versions et notices avant clôture. Ne pas déduire ces versions de la doc latest.
- `MSVCP140.dll`, `VCRUNTIME140.dll`, `VCRUNTIME140_1.dll` : présents dans le sidecar,
  pas un CRT uniquement statique. La présence et les hashes ne prouvent pas les
  droits du distributeur. Rapprocher les DLL du REDIST applicable et consigner les
  conditions de la licence Microsoft effectivement applicable au distributeur.
- `WebView2LoaderStatic.lib`, fourni par `webview2-com-sys` : la licence MIT des
  bindings Rust ne remplace pas les termes du SDK Microsoft. Le loader est
  distinct du runtime WebView2 téléchargé ; inclure ses conditions au même dossier.

Références primaires : [tiers MuPDF 1.26.3](https://mupdf.readthedocs.io/en/1.26.3/other/third-party.html),
[redistribution Microsoft](https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files),
[REDIST VS2022](https://learn.microsoft.com/en-us/visualstudio/releases/2022/redistribution),
[MPL-2.0](https://www.mozilla.org/en-US/MPL/2.0/).

La collecte et le gate vérifient des preuves et leur complétude ; ils ne délivrent
pas de certification juridique. La politique applicative AGPL reste inchangée.
