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

## Revue native MVP-003 — 2026-10-30

Le NSIS MVP-002 reste inchangé : commit `8fe3d4f6af049354b539ff62fbf1b3c3dd630b0e`,
SHA-256 `975800cc45325b22ae213d8763997862a5990c57eb5f3a90d502e7e1d1126eef`.
Les fichiers installés et l'archive source restent intacts. L'inventaire installé
est le **snapshot du build MVP-002** ; l'évaluation externe actuelle est
`data/output/mvp-003/redistribution-inventory.json`, accompagnée de son manifest
hashé. Cette distinction permet d'avancer la revue sans reconstruire le produit
ni changer son commit de compilation.

### MuPDF : provenance technique établie

`NSIS → pdf-engine.exe installé → CArchive/mupdfcpp64.dll` : 24 827 904 octets,
SHA-256 `9e1949ae4e9066f65e80cbfd5003a124f638e431ab9661a57802e1e55efbd4a4`.
Pas de version PE ; timestamp PE `2025-07-02T18:03:51Z`.

Le wheel Windows verrouillé `pymupdf-1.26.3-cp39-abi3-win_amd64.whl`, SHA-256
`b4cd5124d05737944636cf45fc37ce5824f10e707b0342efe109c7b6bd37a9cc`,
contient exactement ces octets et leur hash dans `RECORD`. Les deux `.pyd`
correspondent également. Le runtime utilisant ces mêmes bibliothèques rapporte
PyMuPDF **1.26.3** / MuPDF **1.26.3**. Son `_build.py` identifie l'archive MuPDF
déjà fournie. Les 82 en-têtes MuPDF correspondent, avec le préfixe
`TOFU_CJK_EXT=1` et la conversion CRLF appliqués par `setup.py`.

Le graphe `mupdfcpp.vcxproj → libmupdf.vcxproj`, configuration `Release|x64`,
relie ces composants aux sources vendored et notices déjà présentes :

| Composant statique | Rôle | Licence retenue / notices |
|---|---|---|
| Brotli / zlib | compression | MIT / Zlib |
| FreeType / HarfBuzz | fontes et shaping | FTL / Old MIT et notices par fichier |
| Gumbo / MuJS | HTML / JavaScript PDF | Apache-2.0 / ISC |
| jbig2dec / libjpeg / OpenJPEG | codecs | AGPL + LICENSE / IJG / BSD-2-Clause |
| lcms2 | couleurs | MIT |
| Tesseract / Leptonica | OCR | Apache-2.0 / BSD-2-Clause |
| Extract | extraction de mise en page | AGPL-3.0-or-later |
| Zint backend / ZXing-cpp | codes-barres | BSD-3-Clause / Apache-2.0 |

Le JSON conserve les fichiers actifs et leur empreinte par composant, les projets
et les notices comparées par hash à l'archive MVP-002. Il exclut les sources
`ExcludedFromBuild`, distingue `bin2coff` (outil de build) et ne prétend pas
identifier chaque symbole conservé après optimisation. Les configurations
`ReleaseExtra` ne sont pas assimilées à `Release`. Les sources sont identifiées
par l'archive MuPDF 1.26.3 et leurs empreintes, pas par des versions devinées depuis
des chaînes binaires. Aucun complément de sources MuPDF n'est nécessaire.

### WebView2 : loader et runtime distingués

Loader **statique**, fourni par `webview2-com-sys 0.38.2` ; l'archive de compilation
Cargo correspond octet pour octet à `build/native/x64/WebView2LoaderStatic.lib`
du package **Microsoft.Web.WebView2 1.0.3650.58** publié par Microsoft.
SHA-256 du `.lib` : `0659b741bde6348d4c4a6ec4ceb9af50e3d0048ed9cd3c8659bccbb61fde55ee`.
Le package Microsoft porte un `LICENSE.txt` de type BSD-3-Clause et un `NOTICE.txt`,
ajoutés aux **matériaux externes** de redistribution. Aucune DLL loader n'est
livrée ; la branche MSVC du binding et la bibliothèque de compilation sont vérifiées.

Le runtime **Evergreen n'est pas embarqué**. `downloadBootstrapper` demeure le
mécanisme d'installation Microsoft si le runtime manque ; aucun Fixed Version.

### Unique blocker : droits de redistribution du CRT app-local

| DLL réellement embarquée | Version PE | Provenance Analysis PyInstaller |
|---|---|---|
| MSVCP140.dll | 14.51.36247.0 | Windows System32 |
| VCRUNTIME140.dll | 14.38.33126.1 | installation CPython 3.11.9 |
| VCRUNTIME140_1.dll | 14.38.33126.1 | installation CPython 3.11.9 |

Il s'agit de **DLL copiées localement dans le sidecar**, pas d'un `vc_redist.exe`
embarqué et pas seulement de dépendances externes. MuPDF utilise `/MD` et importe
ces trois DLL ; les API sets UCRT et autres DLL Windows restent fournis par l'OS.
Les imports du sidecar, des `.pyd`/DLL et de l'application Tauri sont enregistrés.

Environnement observé : **Visual Studio Build Tools 2022 17.14.37710.0**, canal
`VisualStudio.17.Release`, redist local 14.44.35112. Le propriétaire a confirmé le
30/10/2026 : **Build Tools uniquement, aucune autre licence Visual Studio connue**.
Les termes Build Tools documentent une exception d'usage pour compiler certaines
dépendances open source ; cela n'établit pas à lui seul une autorisation de
redistribution de ces trois DLL. En particulier, le `MSVCP140.dll` 14.51 récupéré
depuis System32 n'est pas rapproché du redist 14.44 de cet environnement.

Statut **NEEDS_REVIEW**, sans conclusion juridique inventée. Action minimale :
obtenir et consigner un fondement Microsoft applicable à la redistribution des
trois DLL identifiées, notamment celle issue de System32. Aucun changement de
linkage ou de prérequis installateur n'a été introduit pour contourner ce point.

Références primaires : [tiers MuPDF 1.26.3](https://mupdf.readthedocs.io/en/1.26.3/other/third-party.html),
[redistribution Microsoft](https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files),
[REDIST VS2022](https://learn.microsoft.com/en-us/visualstudio/releases/2022/redistribution),
[REDIST VS2026](https://learn.microsoft.com/en-us/visualstudio/releases/2026/redistribution),
[termes Build Tools 2022](https://visualstudio.microsoft.com/license-terms/vs2022-ga-diagnosticbuildtools/),
[termes runtime 2015–2022](https://visualstudio.microsoft.com/license-terms/vs2022-cruntime/),
[SDK Microsoft exact](https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.3650.58),
[distribution WebView2](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution),
[MPL-2.0](https://www.mozilla.org/en-US/MPL/2.0/).

Reproduire la collecte sans rebuild, puis publier l'évaluation depuis un commit
suivi propre :

```powershell
uv run --locked --with pyinstaller==6.16.0 --project services/pdf-engine python -m scripts.native_redistribution inspect
uv run --project services/pdf-engine python -m scripts.native_redistribution publish
npm --prefix apps/desktop run release:verify
```

Preuves sous `data/output/mvp-003/` : `native-inventory.json`,
`static-build-graph.json`, `redistribution-inventory.json`, notices complémentaires,
`THIRD_PARTY_NOTICES_MVP-003.zip` et `RELEASE_MANIFEST.json`. Le gate vérifie les
hashes, le commit de build, celui de revue et l'absence de modifications
fonctionnelles ; une simple promotion du statut dans le tableau ne lève pas le CRT.

La collecte et le gate vérifient des preuves et leur complétude ; ils ne délivrent
pas de certification juridique. La politique applicative AGPL reste inchangée.
