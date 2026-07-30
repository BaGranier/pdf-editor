from __future__ import annotations

import base64
import html
from pathlib import Path

import fitz

from app.conversion.models import ConversionArtifact


NO_TEXT_WARNING = (
    "Certaines pages ne contiennent pas de texte exploitable sans OCR."
)


class PdfToTextConverter:
    def convert(self, input_pdf: Path, output_txt: Path) -> ConversionArtifact:
        contents: list[str] = []
        empty_page_found = False
        with fitz.open(input_pdf) as document:
            for page_number, page in enumerate(document, start=1):
                text = page.get_text("text", sort=True).strip()
                empty_page_found = empty_page_found or not text
                contents.append(f"--- Page {page_number} ---\n\n{text}")
        output_txt.write_text("\n\n".join(contents) + "\n", encoding="utf-8")
        return ConversionArtifact(
            path=output_txt,
            filename="conversion.txt",
            media_type="text/plain; charset=utf-8",
            warnings=(NO_TEXT_WARNING,) if empty_page_found else (),
        )


class PdfToHtmlConverter:
    def convert(self, input_pdf: Path, output_html: Path) -> ConversionArtifact:
        page_sections: list[str] = []
        empty_page_found = False
        with fitz.open(input_pdf) as document:
            for page_number, page in enumerate(document, start=1):
                body: list[str] = []
                for block in page.get_text("dict", sort=True).get("blocks", []):
                    if block.get("type") == 1 and block.get("image"):
                        image_type = block.get("ext", "png")
                        encoded = base64.b64encode(block["image"]).decode("ascii")
                        body.append(
                            '<img alt="Image extraite" '
                            f'src="data:image/{image_type};base64,{encoded}">'
                        )
                    elif block.get("type") == 0:
                        lines = [
                            "".join(
                                span.get("text", "")
                                for span in line.get("spans", [])
                            ).strip()
                            for line in block.get("lines", [])
                        ]
                        text = "\n".join(line for line in lines if line).strip()
                        if text:
                            body.append(
                                f"<p>{html.escape(text).replace(chr(10), '<br>')}</p>"
                            )
                if not body:
                    empty_page_found = True
                    body.append("<p><em>Aucun texte exploitable.</em></p>")
                page_sections.append(
                    f'<section class="pdf-page" data-page="{page_number}">'
                    f"<h2>Page {page_number}</h2>{''.join(body)}</section>"
                )

        rendered = (
            "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\">"
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            "<title>Conversion PDF</title><style>"
            "body{font-family:system-ui,sans-serif;margin:2rem;background:#f3f4f6;"
            "color:#172033}.pdf-page{max-width:60rem;margin:0 auto 2rem;padding:2rem;"
            "background:white;box-shadow:0 1px 4px #0002}.pdf-page img{max-width:100%;"
            "height:auto}p{white-space:normal;line-height:1.5}</style></head><body>"
            + "".join(page_sections)
            + "</body></html>"
        )
        output_html.write_text(rendered, encoding="utf-8")
        return ConversionArtifact(
            path=output_html,
            filename="conversion.html",
            media_type="text/html; charset=utf-8",
            warnings=(NO_TEXT_WARNING,) if empty_page_found else (),
        )
