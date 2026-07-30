#!/usr/bin/env python3
"""Convert Playwright JSON output into QA_AUTOMATED_REPORT.md."""

import base64
import json
import os
import platform
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEB_DIR = PROJECT_ROOT / "apps" / "web"
RESULTS_PATH = WEB_DIR / "test-results" / "results.json"
OUTPUT_PATH = PROJECT_ROOT / "QA_AUTOMATED_REPORT.md"
DOCX_QUALITY_RESULTS_PATH = (
    WEB_DIR / "test-results" / "docx-visual-quality" / "results.json"
)
DOCX_EDITABLE_REAL_RESULTS_PATH = (
    WEB_DIR
    / "test-results"
    / "docx-editable-real-document"
    / "results.json"
)

MANUAL_CHECKS = [
    "Fluidité ressentie lors des longues sessions et des exports extrêmes.",
    "Qualité visuelle globale du rendu PDF.",
    "Acceptabilité d'un éventuel léger décalage de rendu sous Firefox.",
    "Consommation mémoire totale réelle du navigateur et du système.",
    "Raccourcis dépendant du clavier physique ou du système d'exploitation.",
    "Comportement avec des PDF confidentiels ou non reproductibles.",
    "Ouverture des DOCX de référence sous Microsoft Word et LibreOffice pour "
    "juger la fidélité visuelle.",
    "Validation humaine finale du niveau de gravité des anomalies.",
]


@dataclass
class Scenario:
    title: str
    file: str
    project: str
    status: str
    duration_ms: int
    retry: int
    errors: list[str]
    artifacts: list[str]
    skip_reason: str
    diagnostics: dict[str, Any] | None


def command_output(command: list[str], cwd: Path = PROJECT_ROOT) -> str:
    try:
        return subprocess.run(
            command,
            cwd=cwd,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "non disponible"


def collect_specs(
    suites: list[dict[str, Any]],
    parents: tuple[str, ...] = (),
) -> list[Scenario]:
    scenarios: list[Scenario] = []
    for suite in suites:
        next_parents = (*parents, suite.get("title", ""))
        scenarios.extend(collect_specs(suite.get("suites", []), next_parents))
        for spec in suite.get("specs", []):
            title = " › ".join(
                part for part in (*next_parents, spec.get("title", "")) if part
            )
            for test in spec.get("tests", []):
                results = test.get("results", [])
                result = results[-1] if results else {}
                attachments = result.get("attachments", [])
                diagnostics = None
                memory_sample = None
                conversion_results: list[dict[str, Any]] = []
                docx_regression_results: list[dict[str, Any]] = []
                ocr_results: list[dict[str, Any]] = []
                conversion_capture = False
                artifacts: list[str] = []
                for attachment in attachments:
                    attachment_name = attachment.get("name")
                    conversion_capture = (
                        conversion_capture or attachment_name == "conversion-screenshot"
                    )
                    attachment_path = attachment.get("path")
                    if attachment_path:
                        path = Path(attachment_path)
                        try:
                            artifacts.append(str(path.relative_to(PROJECT_ROOT)))
                        except ValueError:
                            artifacts.append(str(path))
                        if attachment_name == "qa-diagnostics" and path.exists():
                            try:
                                diagnostics = json.loads(path.read_text())
                            except (OSError, json.JSONDecodeError):
                                pass
                        elif attachment_name == "conversion-result" and path.exists():
                            try:
                                conversion_results.append(json.loads(path.read_text()))
                            except (OSError, json.JSONDecodeError):
                                pass
                        elif attachment_name == "docx-regression" and path.exists():
                            try:
                                docx_regression_results.append(
                                    json.loads(path.read_text())
                                )
                            except (OSError, json.JSONDecodeError):
                                pass
                    elif (
                        attachment_name == "qa-diagnostics"
                        and attachment.get("body")
                    ):
                        try:
                            diagnostics = json.loads(
                                base64.b64decode(attachment["body"]).decode()
                            )
                        except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
                            pass
                    elif (
                        attachment_name == "memory-sample"
                        and attachment.get("body")
                    ):
                        try:
                            memory_sample = json.loads(
                                base64.b64decode(attachment["body"]).decode()
                            )
                        except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
                            pass
                    elif (
                        attachment_name == "conversion-result"
                        and attachment.get("body")
                    ):
                        try:
                            conversion_results.append(
                                json.loads(
                                    base64.b64decode(attachment["body"]).decode()
                                )
                            )
                        except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
                            pass
                    elif (
                        attachment_name == "docx-regression"
                        and attachment.get("body")
                    ):
                        try:
                            docx_regression_results.append(
                                json.loads(
                                    base64.b64decode(
                                        attachment["body"]
                                    ).decode()
                                )
                            )
                        except (
                            ValueError,
                            UnicodeDecodeError,
                            json.JSONDecodeError,
                        ):
                            pass
                    elif attachment_name == "ocr-result" and attachment.get("body"):
                        try:
                            ocr_results.append(
                                json.loads(
                                    base64.b64decode(attachment["body"]).decode()
                                )
                            )
                        except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
                            pass
                if memory_sample is not None:
                    diagnostics = diagnostics or {}
                    diagnostics["memorySample"] = memory_sample
                if conversion_results:
                    diagnostics = diagnostics or {}
                    diagnostics["conversionResults"] = conversion_results
                    diagnostics["conversionCapture"] = conversion_capture
                if docx_regression_results:
                    diagnostics = diagnostics or {}
                    diagnostics["docxRegressionResults"] = (
                        docx_regression_results
                    )
                if ocr_results:
                    diagnostics = diagnostics or {}
                    diagnostics["ocrResults"] = ocr_results
                annotations = test.get("annotations", [])
                skip_reason = "; ".join(
                    annotation.get("description", "")
                    for annotation in annotations
                    if annotation.get("type") in {"skip", "fixme"}
                )
                scenarios.append(
                    Scenario(
                        title=title,
                        file=spec.get("file", suite.get("file", "")),
                        project=test.get("projectName", "inconnu"),
                        status=test.get("status", result.get("status", "inconnu")),
                        duration_ms=sum(item.get("duration", 0) for item in results),
                        retry=max(0, len(results) - 1),
                        errors=[
                            error.get("message", str(error))
                            for error in result.get("errors", [])
                        ],
                        artifacts=artifacts,
                        skip_reason=skip_reason,
                        diagnostics=diagnostics,
                    )
                )
    return scenarios


def status_label(status: str) -> str:
    return {
        "expected": "RÉUSSI",
        "unexpected": "ÉCHEC",
        "flaky": "RÉUSSI APRÈS RETRY",
        "skipped": "IGNORÉ",
        "passed": "RÉUSSI",
        "failed": "ÉCHEC",
        "timedOut": "ÉCHEC (TIMEOUT)",
        "interrupted": "INTERROMPU",
        "unavailable": "INDISPONIBLE",
    }.get(status, status.upper())


def markdown_escape(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")


def browser_versions() -> str:
    dry_run = command_output(
        ["npx", "playwright", "install", "--dry-run"],
        cwd=WEB_DIR,
    )
    versions = [
        line.strip()
        for line in dry_run.splitlines()
        if line.lower().startswith(("chrome", "chromium", "firefox"))
    ]
    return "; ".join(versions) if versions else "non disponibles"


def render_report(payload: dict[str, Any], scenarios: list[Scenario]) -> str:
    docx_quality: dict[str, Any] | None = None
    docx_editable_real: dict[str, Any] | None = None
    if (
        os.environ.get("QA_DOCX_QUALITY_INCLUDED") != "0"
        and DOCX_QUALITY_RESULTS_PATH.exists()
    ):
        try:
            docx_quality = json.loads(
                DOCX_QUALITY_RESULTS_PATH.read_text(encoding="utf-8")
            )
        except (OSError, json.JSONDecodeError):
            docx_quality = {
                "status": "unavailable",
                "reason": "Le résultat de qualité DOCX est illisible.",
            }
    if DOCX_EDITABLE_REAL_RESULTS_PATH.exists():
        try:
            docx_editable_real = json.loads(
                DOCX_EDITABLE_REAL_RESULTS_PATH.read_text(encoding="utf-8")
            )
        except (OSError, json.JSONDecodeError):
            docx_editable_real = {
                "status": "unavailable",
                "reason": "Le résultat DOCX éditable réel est illisible.",
            }
    failed = [
        scenario
        for scenario in scenarios
        if scenario.status in {"unexpected", "failed", "timedOut", "interrupted"}
    ]
    skipped = [scenario for scenario in scenarios if scenario.status == "skipped"]
    has_non_blocking_findings = any(
        (scenario.diagnostics or {}).get("accessibilityFindings")
        for scenario in scenarios
    )
    quality_status = (docx_quality or {}).get("status")
    editable_real_status = (docx_editable_real or {}).get("status")
    decision = (
        "ÉCHEC"
        if failed
        or quality_status == "failed"
        or editable_real_status == "failed"
        else "RÉUSSITE AVEC RÉSERVES"
        if skipped
        or has_non_blocking_findings
        or quality_status == "unavailable"
        or editable_real_status == "unavailable"
        else "RÉUSSITE"
    )
    commit = command_output(["git", "rev-parse", "--short", "HEAD"])
    dirty = bool(command_output(["git", "status", "--short"]))
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    node_version = command_output(["node", "--version"])
    python_version = command_output(["python3", "--version"])
    playwright_version = command_output(["npx", "playwright", "--version"], WEB_DIR)

    lines = [
        "# Rapport QA navigateur automatisé",
        "",
        "> Ce rapport est généré depuis les résultats Playwright. Il ne remplace ni "
        "`QA_BROWSER_REPORT.md` ni ses observations humaines.",
        "",
        "## Synthèse",
        "",
        f"- Date de campagne : {now}",
        f"- Commit testé : `{commit}{' (arbre de travail modifié)' if dirty else ''}`",
        f"- Système : {platform.platform()}",
        f"- Node : {node_version}",
        f"- Python : {python_version}",
        f"- Playwright : {playwright_version}",
        f"- Navigateurs Playwright : {browser_versions()}",
        f"- Scénarios/navigateurs : {len(scenarios)}",
        f"- Échecs : {len(failed)}",
        f"- Ignorés : {len(skipped)}",
        f"- Décision automatisée : **{decision}**",
        "",
        "Rapport HTML : `apps/web/test-results/playwright-report/index.html`  ",
        "Résultat JSON : `apps/web/test-results/results.json`",
        "",
        "## Résultats par scénario",
        "",
        "| Scénario | Navigateur | Statut | Durée | Retry | Artefacts |",
        "| --- | --- | --- | ---: | ---: | --- |",
    ]
    for scenario in scenarios:
        artifacts = ", ".join(f"`{artifact}`" for artifact in scenario.artifacts) or "—"
        lines.append(
            "| "
            + " | ".join(
                [
                    markdown_escape(scenario.title),
                    markdown_escape(scenario.project),
                    status_label(scenario.status),
                    f"{scenario.duration_ms / 1000:.2f} s",
                    str(scenario.retry),
                    markdown_escape(artifacts),
                ]
            )
            + " |"
        )

    lines.extend(["", "## Erreurs console et réseau", ""])
    diagnostics_found = False
    for scenario in scenarios:
        diagnostics = scenario.diagnostics or {}
        errors = diagnostics.get("unexpectedErrors", [])
        if errors:
            diagnostics_found = True
            lines.append(f"### {scenario.project} — {scenario.title}")
            lines.append("")
            for error in errors:
                lines.append(
                    f"- `{error.get('kind', 'erreur')}` {error.get('message', '')} "
                    f"{error.get('url', '')}".rstrip()
                )
            lines.append("")
    if not diagnostics_found:
        lines.append("Aucune erreur inattendue collectée dans les scénarios terminés.")

    lines.extend(["", "## OCR réel", ""])
    ocr_found = False
    for scenario in scenarios:
        diagnostics = scenario.diagnostics or {}
        for ocr_result in diagnostics.get("ocrResults", []):
            ocr_found = True
            lines.append(f"### {scenario.project} — {scenario.title}")
            lines.append("")
            lines.extend(
                [
                    f"- PDF techniquement valide : "
                    f"{'oui' if ocr_result.get('valid') else 'non'}",
                    f"- Pages : {ocr_result.get('pageCount', 'N/D')}",
                    f"- Texte témoin : "
                    f"{markdown_escape(str(ocr_result.get('witnessText', 'N/D')))}",
                    f"- PDF source conservé : "
                    f"{'oui' if ocr_result.get('sourceRetained') else 'non'}",
                    "",
                ]
            )
    if not ocr_found:
        lines.append("Aucun scénario OCR réel collecté dans cette campagne.")

    lines.extend(["", "## Constats d'accessibilité non bloquants", ""])
    accessibility_findings: list[str] = []
    for scenario in scenarios:
        diagnostics = scenario.diagnostics or {}
        for finding in diagnostics.get("accessibilityFindings", []):
            accessibility_findings.append(
                f"{scenario.project} — {scenario.title} : {finding}"
            )
    if accessibility_findings:
        lines.extend(f"- {finding}" for finding in accessibility_findings)
    else:
        lines.append("Aucun constat non bloquant collecté.")

    lines.extend(["", "## Conversion locale", ""])
    conversion_found = False
    for scenario in scenarios:
        diagnostics = scenario.diagnostics or {}
        conversion_results = diagnostics.get("conversionResults", [])
        if not conversion_results:
            continue
        conversion_found = True
        lines.append(f"### {scenario.project} — {scenario.title}")
        lines.append("")
        for conversion in conversion_results:
            validation = conversion.get("technicalValidation", {})
            witness_text = " ".join(
                str(validation.get("text", "")).split()
            )[:160]
            warnings = conversion.get("warnings", [])
            lines.extend(
                [
                    f"- Format demandé : `{conversion.get('requestedFormat', 'N/D')}`",
                    f"- Durée backend : {conversion.get('durationMs', 'N/D')} ms",
                    f"- Taille entrée/sortie : "
                    f"{conversion.get('inputBytes', 'N/D')} / "
                    f"{conversion.get('outputBytes', 'N/D')} octets",
                    f"- OCR utilisé : "
                    f"{'oui' if conversion.get('ocrUsed') else 'non'}; "
                    f"couche texte : {conversion.get('textLayer', 'N/D')}",
                    f"- Pages converties : {conversion.get('pages', 'N/D')}",
                    f"- Validité technique : "
                    f"{'valide' if validation.get('valid') else 'invalide'}",
                    f"- Texte témoin : "
                    f"{markdown_escape(witness_text) if witness_text else 'N/D'}",
                    f"- Avertissements : "
                    f"{markdown_escape('; '.join(warnings)) if warnings else 'aucun'}",
                    f"- Capture Playwright : "
                    f"{'disponible' if diagnostics.get('conversionCapture') else 'non jointe'}",
                ]
            )
            if validation.get("imageCount") is not None:
                lines.append(
                    "- Comparaison DOCX : "
                    f"{validation.get('paragraphCount', 0)} paragraphes, "
                    f"{validation.get('imageCount', 0)} images, "
                    f"{validation.get('tableCount', 0)} tableaux, "
                    f"orientations {validation.get('orientations', [])}."
                )
            lines.append("")
    if not conversion_found:
        lines.append("Aucun résultat de conversion collecté dans cette campagne.")

    lines.extend(["", "## DOCX visual regression", ""])
    regression_found = False
    for scenario in scenarios:
        diagnostics = scenario.diagnostics or {}
        for regression in diagnostics.get("docxRegressionResults", []):
            regression_found = True
            ratios = regression.get("imageNonWhiteRatios", [])
            lines.extend(
                [
                    f"### {regression.get('browser', scenario.project)} — "
                    f"{regression.get('mode', 'N/D')} — "
                    f"{'restauré' if regression.get('restored') else 'source'}",
                    "",
                    f"- Statut HTTP : {regression.get('httpStatus', 'N/D')}",
                    f"- Taille envoyée/reçue : "
                    f"{regression.get('sentBytes', 'N/D')} / "
                    f"{regression.get('receivedBytes', 'N/D')} octets",
                    f"- Pages PDF source / DOCX : "
                    f"{regression.get('sourcePageCount', 'N/D')} / "
                    f"{regression.get('docxPageCount', 'N/D')}",
                    f"- Images DOCX : {regression.get('imageCount', 'N/D')}",
                    f"- Ratios de pixels non blancs : {ratios or 'N/D'}",
                    f"- Clipping `lineRule=exact` : "
                    f"{'détecté' if regression.get('clippingDetected') else 'non détecté'}",
                    "",
                ]
            )
    if not regression_found:
        lines.append(
            "Aucun résultat navigateur DOCX dédié collecté dans cette campagne."
        )
        lines.append("")

    lines.append("### Validation structurelle et LibreOffice")
    lines.append("")
    if docx_quality is None:
        lines.append(
            "Contrôle LibreOffice non inclus dans cette campagne rapide."
        )
    else:
        rendered_pages = docx_quality.get("renderedPageCount", {})
        image_ratios = docx_quality.get("imageSizeRatios", [])
        lines.extend(
            [
                f"- Statut : **{status_label(str(docx_quality.get('status', 'inconnu')))}**",
                f"- Pages source : {docx_quality.get('sourcePageCount', 'N/D')}",
                f"- Pages DOCX rendues : éditable "
                f"{rendered_pages.get('editable', 'N/D')}, visuel "
                f"{rendered_pages.get('visual', 'N/D')}",
                f"- Images source / DOCX : "
                f"{docx_quality.get('sourceImageCount', 'N/D')} / "
                f"{docx_quality.get('imageCount', 'N/D')}",
                f"- Ratios de largeur image source / DOCX : "
                f"{image_ratios or 'N/D'}",
                f"- Fond noir détecté : "
                f"{'oui' if (docx_quality.get('blackPixelRatio') or 0) >= 0.05 else 'non'}",
                f"- Texte témoin : "
                f"{'présent' if docx_quality.get('witnessTextPresent') else 'absent'}",
                f"- Titre centré : "
                f"{'oui' if docx_quality.get('titleCentered') else 'non'}",
                f"- Déplacement normalisé du texte témoin : "
                f"{docx_quality.get('textDisplacementRatio', 'N/D')}",
                f"- Gras : {'présent' if docx_quality.get('boldPresent') else 'absent'}",
                f"- Surlignage : "
                f"{'présent' if docx_quality.get('highlightPresent') else 'absent'}",
                f"- Encadré : "
                f"{'présent' if docx_quality.get('borderPresent') else 'absent'}",
                f"- Images visuelles : "
                f"{docx_quality.get('visualImageCount', 'N/D')}",
                f"- Ratios de pixels non blancs des images visuelles : "
                f"{docx_quality.get('visualImageNonWhiteRatios', 'N/D')}",
                f"- Clipping `lineRule=exact` : "
                f"{'détecté' if docx_quality.get('visualClippingDetected') else 'non détecté'}",
            ]
        )
        reason = docx_quality.get("reason")
        if reason:
            lines.append(f"- Réserve : {markdown_escape(str(reason))}")
        captures = docx_quality.get("captures", [])
        lines.append(
            "- Captures comparatives : "
            + (
                ", ".join(f"`{capture}`" for capture in captures)
                if captures
                else "non disponibles"
            )
        )

    lines.extend(["", "## DOCX editable real-document regression", ""])
    if docx_editable_real is None:
        lines.extend(
            [
                "- Statut : **NON EXÉCUTÉ**",
                "- Motif : le PDF privé local n'est pas présent. Le test "
                "`docx_real_document` est activé uniquement avec "
                "`QA_REAL_DOCX_PDF` et le fichier reste ignoré par Git.",
            ]
        )
    else:
        title_presence = docx_editable_real.get("titlePresence", {})
        warnings = docx_editable_real.get("warnings", [])
        lines.extend(
            [
                f"- Fichier testé : "
                f"`{markdown_escape(str(docx_editable_real.get('file', 'N/D')))}`",
                f"- Mode DOCX : `{docx_editable_real.get('docxMode', 'N/D')}`",
                f"- Pages PDF / sections DOCX : "
                f"{docx_editable_real.get('sourcePageCount', 'N/D')} / "
                f"{docx_editable_real.get('docxSectionCount', 'N/D')}",
                f"- Texte source extrait : "
                f"{docx_editable_real.get('sourceTextCharacters', 'N/D')} caractères",
                f"- Texte DOCX extrait avec python-docx : "
                f"{docx_editable_real.get('docxTextCharacters', 'N/D')} caractères",
                f"- Ratio de texte conservé : "
                f"{docx_editable_real.get('textRetentionRatio', 'N/D')}",
                f"- Paragraphes / images : "
                f"{docx_editable_real.get('paragraphCount', 'N/D')} / "
                f"{docx_editable_real.get('imageCount', 'N/D')}",
                f"- Logo présent : "
                f"{'oui' if docx_editable_real.get('logoPresent') else 'non'}",
                f"- Fond du logo acceptable : "
                f"{'oui' if docx_editable_real.get('logoBackgroundAcceptable') else 'non'}",
                f"- Titres attendus : "
                f"{markdown_escape(str(title_presence))}",
                f"- Listes détectées : "
                f"{docx_editable_real.get('listCount', 'N/D')}",
                f"- Surlignage / encadré : "
                f"{'oui' if docx_editable_real.get('highlightPresent') else 'non'} / "
                f"{'oui' if docx_editable_real.get('borderPresent') else 'non'}",
                f"- Avertissements : "
                f"{markdown_escape('; '.join(str(item) for item in warnings)) if warnings else 'aucun'}",
                f"- Statut final : "
                f"**{status_label(str(docx_editable_real.get('status', 'inconnu')))}**",
            ]
        )

    lines.extend(["", "## DOCX editable layout fidelity", ""])
    if docx_editable_real is None:
        lines.extend(
            [
                "- Document : fixture réelle locale absente",
                "- Résultat : **R** — contrôle manuel non exécuté.",
            ]
        )
    else:
        rendered_page_count = docx_editable_real.get("renderedPageCount")
        layout_result = (
            "KO"
            if docx_editable_real.get("status") == "failed"
            else "R"
            if rendered_page_count is None
            else "OK"
        )
        lines.extend(
            [
                f"- Document : "
                f"`{markdown_escape(str(docx_editable_real.get('file', 'N/D')))}`",
                f"- Pages source / DOCX estimées / DOCX rendues : "
                f"{docx_editable_real.get('sourcePageCount', 'N/D')} / "
                f"{docx_editable_real.get('estimatedPageCount', 'N/D')} / "
                f"{rendered_page_count if rendered_page_count is not None else 'N/D'}",
                f"- Méthode de mesure : "
                f"`{docx_editable_real.get('pageMeasurement', 'N/D')}`",
                f"- Rétention textuelle : "
                f"{docx_editable_real.get('textRetentionRatio', 'N/D')}",
                f"- Paragraphes éditables / mots : "
                f"{docx_editable_real.get('paragraphCount', 'N/D')} / "
                f"{docx_editable_real.get('editableWordCount', 'N/D')}",
                f"- Paragraphes centrés / longs centrés : "
                f"{docx_editable_real.get('centeredParagraphCount', 'N/D')} / "
                f"{docx_editable_real.get('longCenteredParagraphCount', 'N/D')}",
                f"- Paragraphes entièrement gras / gras mixtes : "
                f"{docx_editable_real.get('fullyBoldParagraphCount', 'N/D')} / "
                f"{docx_editable_real.get('mixedBoldParagraphCount', 'N/D')}",
                f"- Listes / puces vides : "
                f"{docx_editable_real.get('listCount', 'N/D')} / "
                f"{docx_editable_real.get('emptyBulletCount', 'N/D')}",
                f"- Pages quasi vides : "
                f"{docx_editable_real.get('quasiEmptyPageCount', 'N/D')}",
                f"- Sauts de page explicites : "
                f"{docx_editable_real.get('explicitPageBreakCount', 'N/D')}",
                f"- Résultat : **{layout_result}**",
            ]
        )
        render_warning = docx_editable_real.get("renderWarning")
        if render_warning:
            lines.append(
                f"- Réserve : {markdown_escape(str(render_warning))}"
            )

    lines.extend(["", "## Mesures de performance disponibles", ""])
    metric_found = False
    for scenario in scenarios:
        diagnostics = scenario.diagnostics or {}
        operations = diagnostics.get("operationMetrics", [])
        page_metrics = diagnostics.get("pageMetrics")
        if operations or page_metrics:
            metric_found = True
            lines.append(f"### {scenario.project} — {scenario.title}")
            lines.append("")
            for metric in operations:
                lines.append(f"- {metric['name']} : {metric['durationMs']:.2f} ms")
            if page_metrics:
                lines.append(
                    f"- Documents ouverts : {page_metrics.get('openedDocuments', 'N/D')}; "
                    f"pages DOM : {page_metrics.get('renderedPages', 'N/D')}; "
                    f"pages organisées : {page_metrics.get('organizedPages', 'N/D')}."
                )
                heap = page_metrics.get("jsHeap", {})
                if heap.get("usedBytes") is not None:
                    lines.append(
                        f"- Heap JavaScript de la page : {heap['usedBytes']} octets "
                        f"({heap.get('scope', '')})."
                    )
                elif heap:
                    lines.append(f"- Mémoire : N/D — {heap.get('reason', '')}")
            memory_sample = diagnostics.get("memorySample")
            if memory_sample:
                lines.append(
                    "- Échantillon avant ouverture/après fermeture "
                    f"(heap JavaScript de la page) : "
                    f"{memory_sample.get('beforeOpenBytes') or 'N/D'} / "
                    f"{memory_sample.get('afterCloseBytes') or 'N/D'} octets."
                )
                lines.append(f"- Périmètre : {memory_sample.get('scope', '')}")
            lines.append("")
    if not metric_found:
        lines.append("Aucune métrique n'a pu être collectée.")

    lines.extend(["", "## Tests ignorés et justification", ""])
    if skipped:
        for scenario in skipped:
            lines.append(
                f"- {scenario.project} — {scenario.title} : "
                f"{scenario.skip_reason or 'condition de campagne non satisfaite'}"
            )
    else:
        lines.append("Aucun test ignoré.")

    lines.extend(["", "## Contrôles manuels restants", ""])
    lines.extend(f"- {check}" for check in MANUAL_CHECKS)
    lines.extend(
        [
            "",
            "La décision humaine finale « prêt pour OCR » reste consignée séparément.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    if RESULTS_PATH.exists():
        payload = json.loads(RESULTS_PATH.read_text())
        scenarios = collect_specs(payload.get("suites", []))
    else:
        payload = {}
        scenarios = []

    OUTPUT_PATH.write_text(render_report(payload, scenarios))
    print(f"Rapport généré : {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
