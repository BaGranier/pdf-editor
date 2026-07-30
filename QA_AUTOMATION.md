# Campagne QA navigateur automatisée

La campagne Playwright couvre les parcours navigateur, un OCR réel sur scan et
les conversions locales dans Chromium et Firefox. Elle génère ses propres PDF
non confidentiels et ne lit aucun document personnel. Les observations humaines
historiques restent dans `QA_BROWSER_REPORT.md`.

La campagne rapide inclut l’OCR réel ainsi que les smoke tests de conversion
DOCX et TXT. Les artefacts sont inspectés côté test. Le résumé Markdown consigne
le texte témoin OCR et, pour les conversions, les durées, tailles, utilisation
de l’OCR, pages, avertissements et validité technique.

## Installation

Depuis un clone neuf :

```bash
cd services/pdf-engine
uv sync
cd ../../apps/web
npm install
PLAYWRIGHT_BROWSERS_PATH=../../.playwright-browsers \
  npx playwright install chromium firefox
```

`PLAYWRIGHT_BROWSERS_PATH` est facultatif. Il permet de garder les navigateurs
Playwright dans le dépôt de travail (le dossier est ignoré par Git).

## Exécution

Depuis `apps/web` :

```bash
# Campagne complète Chromium + Firefox, tests lents et visuels inclus
npm run qa:e2e

# Campagne rapide utilisée sur les pull requests
npm run qa:e2e:quick

# Équivalent avec un filtre explicite
npm run qa:e2e -- --grep-invert @slow

# Un seul moteur
npm run qa:e2e:chromium
npm run qa:e2e:firefox

# Diagnostic interactif
npm run qa:e2e:headed
npm run qa:e2e:debug
```

La commande vérifie d'abord les ports `5173` et `8000`. Si un service attendu y
est déjà disponible, Playwright le réutilise en local. Sinon, Playwright démarre
Vite et FastAPI, attend leur disponibilité, puis les arrête en fin de campagne.
Un service inattendu sur l'un de ces ports arrête immédiatement la campagne.

Les URL sont configurables avec `QA_BASE_URL` et `QA_BACKEND_URL`. Pour tester des
services déjà démarrés, définir aussi `QA_SKIP_WEBSERVERS=1`.

La campagne utilise un seul worker par défaut afin que les conversions et les
rendus PDF concurrents ne faussent pas les restaurations ni les mesures mémoire.
`QA_WORKERS=2` permet un diagnostic parallèle volontaire, avec une stabilité
potentiellement moindre sur les machines contraintes.

Les fixtures petites sont recréées avant chaque campagne. La campagne complète
génère en plus `pdf-large.pdf`, un fichier reproductible de plus de 50 Mo et
250 pages. `QA_SKIP_LARGE=1` permet d'éviter cette génération lors d'un diagnostic
local ciblé.

La régression DOCX critique est couverte dans
`conversion-docx-regression.spec.ts` sur Chromium et Firefox. Le scénario
convertit une fixture synthétique immédiatement après ouverture, puis après
rechargement et restauration IndexedDB, dans les modes éditable et visuel. Il
contrôle le multipart envoyé, l'absence de HTTP 502, les tailles d'entrée et de
sortie, les pixels non blancs des images et l'absence de clipping Word
`lineRule="exact"`.

## Résultats

Après l'exécution :

- `apps/web/test-results/playwright-report/` : rapport HTML ;
- `apps/web/test-results/results.json` : rapport machine ;
- `apps/web/test-results/screenshots/` : captures d'échecs ;
- `apps/web/test-results/traces/` : traces du premier retry ;
- `apps/web/test-results/videos/` : vidéos des échecs ;
- `QA_AUTOMATED_REPORT.md` : résumé de campagne.
- `apps/web/test-results/docx-visual-quality/` : mesures structurelles DOCX,
  rendu LibreOffice et comparaisons côte à côte lorsque disponibles.
- `apps/web/test-results/docx-editable-real-document/results.json` : mesures
  agrégées du test DOCX éditable sur document local, sans contenu PDF ou DOCX.

Le code de sortie reste celui de Playwright si un scénario bloquant échoue, même
si le résumé Markdown a pu être généré. Pour régénérer seulement le résumé :

```bash
npm run qa:report
```

Le rapport HTML s'ouvre avec `npm run qa:e2e:report`.

### Régression DOCX éditable sur document réel

Le PDF privé n'est jamais versionné. Le chemin
`data/input/manual-docx-regression/` est couvert par les règles d'ignorance des
PDF d'entrée. Le test est ignoré lorsque le fichier n'existe pas et s'active
localement ainsi :

```bash
cd services/pdf-engine
QA_REAL_DOCX_PDF=data/input/manual-docx-regression/2-ENGAGEMENT_INDIVIDUEL_ETUDIANT_2026-2027.pdf \
  UV_CACHE_DIR=/tmp/pdf-engine-uv-cache \
  uv run pytest -m docx_real_document
```

La validation rouvre obligatoirement la sortie avec `python-docx`, contrôle
qu'elle contient des paragraphes modifiables et au moins 95 % des mots source,
et refuse qu'une sortie image-only valide le mode `editable`. Elle mesure aussi
les paragraphes centrés, le gras intégral ou mixte, les listes et puces vides,
les sections Word, les sauts explicites et les pages quasi vides. LibreOffice
fournit le nombre de pages rendu lorsqu'il est utilisable ; sinon le rapport
indique explicitement la mesure structurelle et la réserve. Le rapport
Markdown indique « non exécuté » lorsque la donnée privée locale est absente.
La section « DOCX editable spacing quality » publie également les valeurs
d'interlignage, les espacements avant/après, la marge interne de l'encadré et
une estimation de densité par section, la moyenne de mots et de lignes estimées
par paragraphe, sans reprendre le texte privé. Le statut de lisibilité devient
un échec si les paragraphes longs sont compactés sous 1,12, même lorsque le
document tient dans ses trois sections structurelles.

## Isolation et diagnostics

Playwright crée un contexte neuf pour chaque test. Les scénarios de persistance
inspectent explicitement IndexedDB (`pdf-editor-mvp-db`) et les clés
`localStorage`. Une fixture automatique collecte pour chaque test :

- `console.error` et erreurs non gérées de page ;
- requêtes réseau échouées ;
- réponses HTTP 500 et plus ;
- durées instrumentées ;
- nombre de documents/pages présents ;
- heap JavaScript de la page sous Chromium, lorsque disponible.

Le heap JavaScript n'est pas présenté comme la mémoire totale du navigateur.
Firefox indique explicitement cette mesure comme non disponible. Seules les
annulations réseau propres au cycle de navigation sont autorisées par défaut ;
une erreur connue propre à un scénario doit être ajoutée localement et justifiée.
Lors de cette première intégration, les constats de contraste sont non bloquants
mais figurent séparément dans le rapport Markdown ; les contrôles sans nom
accessible et la navigation clavier restent bloquants.

## Captures visuelles

Les références sont séparées automatiquement par projet Chromium/Firefox. La
tolérance est `maxDiffPixelRatio: 0.02`, avec animations désactivées et curseur
masqué. Elle absorbe de faibles différences d'anticrénelage sans accepter un
changement structurel important.

Mettre à jour volontairement les références après revue :

```bash
npm run qa:e2e:update-snapshots -- --grep @visual
```

## Contrôles manuels restants

Ces contrôles sont documentés dans le résumé, mais ne bloquent pas la campagne :

- fluidité ressentie ;
- qualité visuelle globale du rendu PDF ;
- acceptabilité du décalage Firefox ;
- consommation mémoire totale réelle du navigateur et du système ;
- raccourcis dépendant du clavier physique ;
- comportement avec des PDF confidentiels ou non reproductibles ;
- validation finale du niveau de gravité des anomalies.
