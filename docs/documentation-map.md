# Inventaire et migration documentaire STAB-2026-11

Cette première section décrit la migration de STAB-2026-11. Les emplacements
courants sont dans le [bilan DOC-CLEANUP-001](#doc-cleanup-001--centralisation-des-markdown).

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

## DOC-CLEANUP-001 — Centralisation des Markdown

Base `e164415`. L'inventaire avant déplacement compte 35 Markdown suivis,
dont 19 hors de `docs/` et du `README.md` racine. Aucun Markdown non suivi
et non ignoré n'était présent. Les 15 Markdown déjà classés dans `docs/`
restent à leur emplacement. Aucun modèle de PR ou d'issue GitHub en Markdown,
ni instruction d'agent locale dans un sous-projet, n'a été trouvé.

| Chemin initial | Rôle et consommateurs principaux | Décision et destination |
| --- | --- | --- |
| `README.md` | Entrée publique et lancement | Conserver à la racine |
| `AGENTS.md` | Consignes automatiques Codex, audit | Conserver à la racine. Exception de découverte |
| `CLAUDE.md` | Consignes automatiques Claude Code, harnais `make agent-claude` | Conserver à la racine. Exception de découverte |
| `AGENTS.template.md` | Modèle du harnais, inventaire `.template/adoption.json` | Déplacer vers `docs/agents/AGENTS.template.md`. Le modèle partage les octets du fichier actif de Claude mais garde son rôle et sa provenance |
| `CONVERSION.md` | Contrat de conversion, audit et parcours utilisateur | Déplacer vers `docs/features/CONVERSION.md` |
| `DESKTOP.md` | Architecture, IPC et packaging, guides et agents | Déplacer vers `docs/architecture/DESKTOP.md` |
| `DEVELOPMENT.md` | Installation de développement, README et QA | Déplacer vers `docs/getting-started/DEVELOPMENT.md` |
| `MVP_STATUS.md` | Statut Preview, agents, QA et archives release | Déplacer vers `docs/product/MVP_STATUS.md` |
| `NATIVE_TEXT_EDITING.md` | Contrat texte natif et audit | Déplacer vers `docs/features/NATIVE_TEXT_EDITING.md` |
| `NEXT_STEPS.md` | Gate général, agents, QA et dette | Déplacer vers `docs/product/NEXT_STEPS.md` |
| `PDF_EDITOR_FEATURE_AUDIT.md` | Redirection créée après archivage, citée par la carte historique | Retirer le doublon de navigation. L'index pointe vers [l'audit original](audits/2026-11-21-functional-audit.md) et [son suivi](product/STAB-2026-11.md) |
| `QA_AUTOMATION.md` | Protocole QA, générateur de rapport et guides | Déplacer vers `docs/qa/QA_AUTOMATION.md` |
| `QA_BROWSER_REPORT.md` | Campagne navigateur du 16 novembre 2026, index et protocole QA | Déplacer vers `docs/qa/runs/QA_BROWSER_REPORT.md`. Préserver le périmètre et les verdicts |
| `REDACTION_STAMPS.md` | Contrat de sécurité, statut, audit et rapport QA | Déplacer vers `docs/features/REDACTION_STAMPS.md` |
| `SIDEBAR_AND_WATERMARKS.md` | Contrat des commandes, statut et rapport filigranes | Déplacer vers `docs/features/SIDEBAR_AND_WATERMARKS.md` |
| `SIGNATURE_NUMERIQUE_004.md` | Décision signature par certificat, dette et audit | Déplacer vers `docs/product/SIGNATURE_NUMERIQUE_004.md` |
| `TECHNICAL_DEBT.md` | Dette canonique, agents, gates et audit | Déplacer vers `docs/product/TECHNICAL_DEBT.md` |
| `THIRD_PARTY_NOTICES.md` | Preuves licences, guides et scripts de redistribution | Déplacer vers `docs/architecture/THIRD_PARTY_NOTICES.md`. Garder les noms des entrées ZIP historiques |
| `WINDOWS_PREVIEW.md` | Guide Preview, README, gate et archives release | Déplacer vers `docs/getting-started/WINDOWS_PREVIEW.md` |
| `apps/web/public/fonts/NOTICE.md` | Notice des polices, Vite, E2E, sidecar et inventaire de redistribution | Déplacer vers `docs/architecture/NOTICE.md`. Conserver les mêmes octets à `/fonts/NOTICE.md`, dans le sidecar et dans l'archive des notices |

`QA_AUTOMATED_REPORT.md` est généré, ignoré et référencé par CI. Son chemin
reste le même. Le script inscrit le nouveau chemin du protocole dans le rapport.
Les chemins cités dans les commandes `git show`, les manifestes d'artefacts
historiques et les noms d'entrées ZIP gardent leur sens d'origine. Pour un lien
GitHub publié avant la migration, utiliser l'index courant ou un lien ancré au
commit qui contenait encore l'ancien chemin.

Résultat attendu après migration : 34 Markdown suivis. Hors `docs/` et
`README.md`, `AGENTS.md` et `CLAUDE.md` restent chargés par convention à la
racine. Le harnais lance les deux clients depuis le dépôt, sans argument de
remplacement de ces fichiers. La session Codex disposait des consignes
racine. Les cibles `make agent-codex` et `make agent-claude` ont été contrôlées
en mode simulation, sans session Claude authentifiée. L'invariant strict
reste bloqué tant que ces exceptions ne sont pas acceptées ou qu'une autre
découverte n'a pas été qualifiée.

Le contrôle local couvre 239 liens internes, avec zéro lien cassé et quatre
liens vers des preuves locales ignorées exclus du contrôle. Les 15 tests de
redistribution couvrent les chemins du ZIP et le filtre de provenance. Le
contrôle Desktop statique, le build Vite et le service de `fonts/NOTICE.md`
ont été vérifiés. Le gel PyInstaller et l'installation native restent hors
de cette validation. La migration n'actualise aucun verdict de campagne.
