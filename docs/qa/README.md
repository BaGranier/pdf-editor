# Qualification et preuves QA

Le [guide QA canonique](QA_AUTOMATION.md) décrit les installations, les
commandes et les critères de réussite. Le [statut Preview](../product/MVP_STATUS.md)
porte le verdict du candidat exact. Le [gate de diffusion](../product/NEXT_STEPS.md)
porte les obligations supplémentaires.

- [23 novembre 2026 — Qualification Windows 0.2.0](runs/2026-11-23-windows-release-qualification.md)
- [21 novembre 2026 — Gate Windows STAB-2026-11](runs/2026-11-21-windows-preview.md)
- [Thèmes et menus](../QA_THEMES_NAV_OVERLAYS.md)
- [Images](../QA_IMAGE_DOCUMENTS.md)
- [Icônes](../QA_SIDEBAR_ICONS.md)
- [Filigranes répétés](../QA_SIDEBAR_WATERMARK_TILING.md)
- [Biffage et tampons](runs/QA_BROWSER_REPORT.md)

Pour reprendre PERF-01, associer chaque exécution au hash de l'artefact,
à l'OS, à la RAM, au navigateur ou à WebView2, au nombre de pixels et au DPR.
Le [pilote Windows](../../scripts/windows-qa-performance.ps1) mesure le démarrage,
le working set et le CPU du groupe de processus sur l'exécutable installé.
Compléter sur la même machine par des mesures avant/après fermeture pendant
les scénarios gros scans, 50 Mo, 250 pages, huit onglets et multi-assets.
Les seuils courants sont des avertissements. Le test navigateur
[asset-stress](../../apps/web/e2e/specs/asset-stress.spec.ts) ne mesure
pas la mémoire GPU native.

Pour PRINT-01, ouvrir un PDF composé avec des modifications distinctives sur
l'artefact installé, vérifier l'aperçu puis suivre la demande jusqu'au dialogue
OS. Enregistrer un résultat Microsoft Print to PDF, le rouvrir et comparer ses
pages et contenus. Consigner aussi annulation et échec. Le parcours externe
reste le parcours Preview.
