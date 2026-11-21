# Documentation de PDF Studio Local

Les guides, contrats et gates ci-dessous décrivent le dépôt courant. Les rapports
QA datés et les audits documentent les résultats et limites de leur campagne.

| Besoin | Référence |
| --- | --- |
| Installer ou démarrer l'application | [README](../README.md) et [Windows Preview](getting-started/WINDOWS_PREVIEW.md) |
| Ouvrir un PDF protégé, enregistrer, biffer et imprimer | [Guide des flux documentaires](user/document-workflows.md) |
| Lire et éditer les documents, utiliser les thèmes, importer des images | [Référence de l’éditeur](user/editor-reference.md) |
| Développer, maintenir le runtime Tauri et les licences | [Développement](getting-started/DEVELOPMENT.md), [Desktop](architecture/DESKTOP.md), [Redistribution](architecture/THIRD_PARTY_NOTICES.md), [Notice des polices](architecture/NOTICE.md) |
| Contrats des fonctions | [Conversion](features/CONVERSION.md), [Texte natif](features/NATIVE_TEXT_EDITING.md), [Biffage et tampons](features/REDACTION_STAMPS.md), [Sidebar et filigranes](features/SIDEBAR_AND_WATERMARKS.md) |
| Statut Windows et suite de la release | [Statut canonique Preview](product/MVP_STATUS.md), [Gate et prochaines étapes de diffusion générale](product/NEXT_STEPS.md) |
| Dette et décisions différées | [Dette canonique](product/TECHNICAL_DEBT.md), [Signature par certificat](product/SIGNATURE_NUMERIQUE_004.md) |
| Audit et résultats de la stabilisation | [Audit historique du 21 novembre](audits/2026-11-21-functional-audit.md), [Suivi STAB-2026-11](product/STAB-2026-11.md) |
| Campagnes et preuves | [Index QA](qa/README.md) |
| Organisation du dépôt et consignes agents | [Inventaire et migration](documentation-map.md), [Codex](../AGENTS.md), [Claude Code](../CLAUDE.md), [Outillage agents](agent.md), [Sécurité agent](agent-security.md), [Podman](podman.md) |

Depuis la racine, `python scripts/check-doc-links.py` contrôle les chemins
relatifs et les ancres Markdown du dépôt. Les URLs externes et les liens vers
des preuves locales ignorées dans `data/output` sont hors de ce contrôle.
