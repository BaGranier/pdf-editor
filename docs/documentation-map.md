# Inventaire et migration documentaire STAB-2026-11

L'inventaire initial comprend 27 Markdown suivis, dont un rapport de
qualification ajouté au lot A. Les consommateurs ont été recensés dans les
liens Markdown, les consignes agents, la CI, les scripts de redistribution et de
QA, les sources et le Makefile. Les rapports ignorés sous `data/output` sont des
preuves locales de campagne.

| Chemin initial | Chemin canonique | Rôle | Action |
| --- | --- | --- | --- |
| `README.md`, `AGENTS.md`, `AGENTS.template.md`, `CLAUDE.md` | Identique | Entrée utilisateur et consignes | Garder les chemins publics et agents |
| `MVP_STATUS.md`, `NEXT_STEPS.md`, `WINDOWS_PREVIEW.md`, `THIRD_PARTY_NOTICES.md` | Identique | Statut Preview, gate général, distribution et notices | Garder. La redistribution lit des noms racine fixes |
| `TECHNICAL_DEBT.md` | Identique | Dette durable | Garder la référence canonique |
| `DEVELOPMENT.md`, `DESKTOP.md`, `QA_AUTOMATION.md` | Identique | Contrats de développement, Tauri et stratégie QA | Garder et indexer |
| `CONVERSION.md`, `NATIVE_TEXT_EDITING.md`, `REDACTION_STAMPS.md`, `SIDEBAR_AND_WATERMARKS.md`, `SIGNATURE_NUMERIQUE_004.md` | Identique | Contrats fonctionnels et décisions spécialisées | Garder les références établies |
| `PDF_EDITOR_FEATURE_AUDIT.md` | `docs/audits/2026-11-21-functional-audit.md` | Constat historique du 21 novembre | Déplacer, rebaser les liens, garder un index au chemin d'origine |
| Sections d’usage de `README.md` | `docs/user/editor-reference.md` | Modes de lecture, interface, images, options d’export et limites | Déplacer le détail, garder les parcours essentiels dans le README |
| `QA_BROWSER_REPORT.md`, `docs/QA_*.md`, `docs/qa/runs/2026-11-21-windows-preview.md` | Identique | Campagnes exécutées et preuves datées | Garder le périmètre et les chemins historiques |
| `docs/agent-security.md`, `docs/agent.md`, `docs/podman.md`, `apps/web/public/fonts/NOTICE.md` | Identique | Outillage agent, conteneur et notices des polices | Garder |
| `QA_AUTOMATED_REPORT.md` | Identique, ignoré | Rapport généré | Garder le contrat des scripts et de GitHub Actions |
| Nouveau | `docs/README.md`, `docs/qa/README.md`, `docs/user/document-workflows.md`, `docs/product/STAB-2026-11.md` | Index, procédures de reprise et suivi des risques | Créer. Les décisions Preview et diffusion restent dans leurs gates |

L'audit de départ est récupérable octet pour octet par
`git show 00590c3:PDF_EDITOR_FEATURE_AUDIT.md`. Son archive conserve ses
constats et ses résultats datés. Les changements de chemin relatifs permettent
de suivre les mêmes pièces justificatives.
