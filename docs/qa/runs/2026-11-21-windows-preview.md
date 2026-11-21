# QUALIF-01 — Qualification Preview Windows du 21 novembre 2026

**NON VALIDÉ — QA manuelle Windows requise.** Référence de l'inspection
`00590c399e11973a44e88e86db32d7227760f344`, branche
`agent/20261121T193729282264Z`, worktree initial propre. Runner Linux x86_64.
Aucun installateur candidat ni manifeste local de gate trouvé sous
`data/output`. Le runner ne dispose pas de VM Windows configurée.

Le [statut MVP](../../product/MVP_STATUS.md) identifie le NSIS x64 0.1.0 du build
`ae97cb80115de78c795a9118d484d01ba3e63cd0`. SHA-256 attendu d'après ce
document, **non mesuré pendant cette campagne** :
`f207904fcb1521c62460c54f98bbf9169d9b245b70a8d73052a1adb28c1bb735`.
Windows installé, architecture de la VM, WebView2 et versions des
ressources OCR restent à relever. L'historique du poste dev garde sa portée.

| Étape | Statut | Preuve requise |
| --- | --- | --- |
| Localiser le NSIS exact et vérifier son hash | BLOCKED | Binaire, inventaire de build et résultat de `Get-FileHash -Algorithm SHA256` |
| Installation interactive, lancement et version WebView2 | NOT RUN | VM x64 vierge sous snapshot, journal et versions |
| PDF, image, plan de pages, PDF protégé | NOT RUN | Fixtures du dépôt, pages et captures synthétiques |
| Save As, modification, réouverture et erreur de destination | NOT RUN | Hash source avant/après, comparaison de la copie, état dirty après refus |
| OCR hors ligne eng et fra | NOT RUN | Réseau coupé après installation, sorties contenant les sentinelles de texte attendues |
| Fermeture, relance, désinstallation | NOT RUN | Inventaire des processus/ports et résultats de relance |
| Impression WebView2 vers Microsoft Print to PDF | BLOCKED | Dialogue OS et fichier imprimé vérifié. Parcours distinct du gate Preview |

Sur la VM, suivre le [gate Preview existant](../QA_AUTOMATION.md#gate-mvp-preview-windows)
et le [parcours Windows Preview](../../getting-started/WINDOWS_PREVIEW.md).
Relever le SHA-256 de l'installateur avant l'installation. Rejouer le parcours
interactif avec les fixtures synthétiques et garder les preuves sous
`data/output`. Les scripts existants complètent l'essai installé. Toute
reconstruction demande le hash du nouvel artefact et une qualification propre.
