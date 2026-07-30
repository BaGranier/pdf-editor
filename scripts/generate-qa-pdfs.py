#!/usr/bin/env python3
"""Generate deterministic, non-confidential PDF fixtures for browser QA."""

from __future__ import annotations

import argparse
from pathlib import Path

import fitz
from pypdf import PdfWriter


PROJECT_ROOT = Path(__file__).resolve().parents[1]
FIXTURE_DIR = PROJECT_ROOT / "apps" / "web" / "e2e" / "fixtures"
LARGE_PAYLOAD_SIZE = 51 * 1024 * 1024


def write_pdf(name: str, page_sizes: list[tuple[float, float]]) -> Path:
    writer = PdfWriter()
    for index, (width, height) in enumerate(page_sizes, start=1):
        writer.add_blank_page(width=width, height=height)
        writer.add_metadata({f"/QaPage{index}": f"{name}:{index}:{width}x{height}"})

    output_path = FIXTURE_DIR / name
    with output_path.open("wb") as output:
        writer.write(output)
    return output_path


def write_large_pdf() -> Path:
    writer = PdfWriter()
    for index in range(250):
        writer.add_blank_page(width=300 + index, height=700)

    pattern = b"PDF-EDITOR-QA-LARGE-FIXTURE\n"
    payload = (pattern * (LARGE_PAYLOAD_SIZE // len(pattern) + 1))[:LARGE_PAYLOAD_SIZE]
    writer.add_attachment("deterministic-qa-payload.bin", payload)
    output_path = FIXTURE_DIR / "pdf-large.pdf"
    with output_path.open("wb") as output:
        writer.write(output)

    if output_path.stat().st_size <= 50 * 1024 * 1024:
        raise RuntimeError("La fixture volumineuse générée ne dépasse pas 50 Mo.")
    return output_path


def save_fitz_fixture(name: str, document: fitz.Document) -> Path:
    output_path = FIXTURE_DIR / name
    document.save(output_path, garbage=4, deflate=True)
    document.close()
    return output_path


def create_scan_image(text: str) -> bytes:
    source = fitz.open()
    page = source.new_page(width=612, height=792)
    page.insert_text((55, 220), text, fontsize=30, fontname="helv")
    image = page.get_pixmap(dpi=200, alpha=False).tobytes("png")
    source.close()
    return image


def generate_conversion_fixtures() -> list[Path]:
    generated: list[Path] = []

    simple = fitz.open()
    page = simple.new_page(width=612, height=792)
    page.insert_text((60, 100), "Conversion locale PDF", fontsize=24)
    page.insert_text(
        (60, 145),
        "Document numérique français : été, élève, Noël.",
        fontsize=16,
    )
    second_page = simple.new_page(width=612, height=792)
    second_page.insert_text(
        (60, 100),
        "English digital document - second page.",
        fontsize=18,
    )
    generated.append(save_fitz_fixture("conversion-simple-text.pdf", simple))

    columns = fitz.open()
    page = columns.new_page(width=612, height=792)
    page.insert_textbox(
        fitz.Rect(50, 70, 285, 700),
        "Colonne gauche\nPremier paragraphe\nDeuxième paragraphe",
        fontsize=14,
    )
    page.insert_textbox(
        fitz.Rect(325, 70, 560, 700),
        "Right column\nFirst paragraph\nSecond paragraph",
        fontsize=14,
    )
    generated.append(save_fitz_fixture("conversion-two-columns.pdf", columns))

    table = fitz.open()
    page = table.new_page(width=612, height=792)
    page.insert_text((60, 70), "Tableau simple", fontsize=24)
    x_positions = [60, 230, 400, 550]
    y_positions = [130, 180, 230, 280]
    for x_position in x_positions:
        page.draw_line((x_position, y_positions[0]), (x_position, y_positions[-1]))
    for y_position in y_positions:
        page.draw_line((x_positions[0], y_position), (x_positions[-1], y_position))
    for x_position, text in zip(
        (75, 245, 415),
        ("Produit", "Quantité", "Prix"),
        strict=True,
    ):
        page.insert_text((x_position, 165), text, fontsize=11)
    page.insert_text((75, 215), "Livre", fontsize=11)
    page.insert_text((245, 215), "2", fontsize=11)
    page.insert_text((415, 215), "24 €", fontsize=11)
    generated.append(save_fitz_fixture("conversion-table.pdf", table))

    image_bytes = create_scan_image("SYNTHETIC IMAGE")
    images = fitz.open()
    page = images.new_page(width=612, height=792)
    page.insert_text((60, 70), "Document avec image intégrée", fontsize=22)
    page.insert_image(fitz.Rect(60, 120, 500, 650), stream=image_bytes)
    generated.append(save_fitz_fixture("conversion-images.pdf", images))

    scan = fitz.open()
    page = scan.new_page(width=612, height=792)
    page.insert_image(page.rect, stream=create_scan_image("SCANNED OCR WITNESS"))
    generated.append(save_fitz_fixture("conversion-scan.pdf", scan))

    mixed = fitz.open()
    page = mixed.new_page(width=612, height=792)
    page.insert_text((60, 140), "DIGITAL MIXED WITNESS", fontsize=24)
    page = mixed.new_page(width=612, height=792)
    page.insert_image(page.rect, stream=create_scan_image("SCANNED MIXED WITNESS"))
    generated.append(save_fitz_fixture("conversion-mixed.pdf", mixed))

    landscape = fitz.open()
    page = landscape.new_page(width=792, height=612)
    page.insert_text((60, 120), "Landscape conversion witness", fontsize=24)
    generated.append(save_fitz_fixture("conversion-landscape.pdf", landscape))
    return generated


def generate(include_large: bool) -> list[Path]:
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    generated = [
        write_pdf("pdf-small-1-page.pdf", [(320, 460)]),
        write_pdf(
            "pdf-small-5-pages.pdf",
            [(300 + index * 25, 500) for index in range(5)],
        ),
        write_pdf(
            "pdf-landscape-portrait.pdf",
            [(320, 520), (720, 360), (360, 600), (800, 400)],
        ),
        write_pdf(
            "pdf-long.pdf",
            [(320 + index, 520 + (index % 3) * 20) for index in range(30)],
        ),
    ]
    corrupted_path = FIXTURE_DIR / "pdf-corrupted.pdf"
    corrupted_path.write_bytes(
        b"%PDF-1.7\n% deterministic fixture intentionally corrupted\n"
        b"1 0 obj << /Type /Catalog >> endobj\n%% missing xref and trailer"
    )
    generated.append(corrupted_path)
    generated.extend(generate_conversion_fixtures())

    if include_large:
        generated.append(write_large_pdf())

    return generated


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--include-large",
        action="store_true",
        help="Génère aussi le PDF de robustesse de plus de 50 Mo et 250 pages.",
    )
    args = parser.parse_args()
    for fixture in generate(args.include_large):
        print(f"{fixture.relative_to(PROJECT_ROOT)} ({fixture.stat().st_size} octets)")


if __name__ == "__main__":
    main()
