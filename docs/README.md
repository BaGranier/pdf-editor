# Documentation de PDF Studio Local

| Besoin | Référence |
| --- | --- |
| Installer ou démarrer l'application | [README](../README.md) et [Windows Preview](../WINDOWS_PREVIEW.md) |
| Ouvrir un PDF protégé, enregistrer, biffer et imprimer | [Guide des flux documentaires](user/document-workflows.md) |
| Lire et éditer les documents, utiliser les thèmes, importer des images | [Référence de l’éditeur](user/editor-reference.md) |
| Développer, maintenir le runtime Tauri et les licences | [Développement](../DEVELOPMENT.md), [Desktop](../DESKTOP.md), [Notices](../THIRD_PARTY_NOTICES.md) |
| Contrats des fonctions | [Conversion](../CONVERSION.md), [Texte natif](../NATIVE_TEXT_EDITING.md), [Biffage et tampons](../REDACTION_STAMPS.md), [Sidebar et filigranes](../SIDEBAR_AND_WATERMARKS.md) |
| Verdict et release Windows | [Statut Preview](../MVP_STATUS.md), [Gate de diffusion générale](../NEXT_STEPS.md) |
| Dette et décisions différées | [Dette canonique](../TECHNICAL_DEBT.md), [Signature par certificat](../SIGNATURE_NUMERIQUE_004.md) |
| Audit et résultats de la stabilisation | [Audit historique du 21 novembre](audits/2026-11-21-functional-audit.md), [Suivi STAB-2026-11](product/STAB-2026-11.md) |
| Campagnes et preuves | [Index QA](qa/README.md) |
| Organisation du dépôt et consignes agents | [Inventaire et migration](documentation-map.md), [AGENTS](../AGENTS.md), [Outillage agents](agent.md), [Sécurité agent](agent-security.md), [Podman](podman.md) |

Depuis la racine, `python scripts/check-doc-links.py` contrôle les chemins
relatifs et les ancres Markdown du dépôt. Les URLs externes et les liens vers
des preuves locales ignorées dans `data/output` sont hors de ce contrôle.
