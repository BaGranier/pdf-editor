# PDF Studio Local — Windows Preview

Windows x64 uniquement. Linux et macOS ne sont pas supportés par cette Preview.
Le NSIS est l'installateur officiel ; le MSI est secondaire.

La Preview est **non signée** : Windows/SmartScreen peut afficher un avertissement.
WebView2 est requis. S'il manque, l'installateur télécharge son bootstrapper :
une connexion Internet est alors nécessaire. Aucun runtime offline n'est embarqué.

L'impression intégrée est expérimentale. Enregistrez/exportez le PDF puis imprimez
depuis votre lecteur PDF. Save/Export natif est limité à **25 Mio par PDF généré**.
Les autres limites du périmètre sont dans [MVP_STATUS.md](MVP_STATUS.md).

## Reconstruction et dossier de redistribution

Prérequis de build : Node 22, Python 3.11.9, uv, Rust >=1.88, MSVC/SDK Windows,
outils Tauri Windows. Installer les dépendances depuis les lockfiles :
`npm ci --prefix apps/web`, `npm ci --prefix apps/desktop`,
`uv sync --locked --directory services/pdf-engine`.

Depuis un commit propre (l'audit non suivi peut rester présent) :

```powershell
npm --prefix apps/desktop run desktop:build
npm --prefix apps/desktop run release:sources
uv run --locked --with pyinstaller==6.16.0 --project services/pdf-engine python -m scripts.release-inventory --output data/output/mvp-002/component-inventory.json
npm --prefix apps/desktop run release:verify
npm --prefix apps/web run qa:mvp
```

Le build prépare automatiquement les langues OCR, fontes et notices Python,
puis collecte les modules frontend émis et les preuves Rust. Les sources tierces
et notices téléchargées sont verrouillées par hash. `release:sources` utilise
`git archive HEAD`, jamais les fichiers non suivis, puis ajoute les sources
PyMuPDF/MuPDF/NSIS et celles des crates retenues. Le contenu applicatif conserve
ses manifests, lockfiles, scripts, licences et instructions de compilation.

Sorties ignorées : `data/output/mvp-002/RELEASE_MANIFEST.json`, archive
`PDF-Studio-Local_<version>_<commit>_sources.zip`, `THIRD_PARTY_NOTICES.zip`.
L'inventaire détaillé et les notices sont aussi installés sous
`licenses/redistribution/`. Livrer les sources et notices **avec** le NSIS,
pas seulement un lien vers un dépôt privé. Ne pas partager si le manifest porte
`NEEDS_REVIEW` ou si `release:verify` renvoie 2.

VM clean : **À VALIDER MANUELLEMENT** par le propriétaire. Aucun résultat du poste
de développement ne constitue une preuve VM clean.
