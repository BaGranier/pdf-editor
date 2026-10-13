"""Small synthetic encrypted and raster-only OCR corpus; no personal inputs."""

from pathlib import Path
import fitz

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "apps/web/e2e/fixtures"


def generate() -> None:
    FIXTURES.mkdir(parents=True, exist_ok=True)
    with fitz.open() as doc:
        page = doc.new_page(width=500, height=650)
        page.insert_text((40, 70), "PROTECTED PDF WITNESS", fontsize=20)
        doc.save(
            FIXTURES / "password-protected.pdf",
            encryption=fitz.PDF_ENCRYPT_AES_256,
            user_pw="synthetic-open",
            owner_pw="synthetic-owner",
            permissions=-1,
        )
    for name, angle, contrast, pages in [
        ("0", 0, False, 1),
        ("90", 90, False, 1),
        ("180", 180, False, 1),
        ("270", 270, False, 1),
        ("skew-positive", 3, False, 1),
        ("skew-negative", -3, False, 1),
        ("contrast", 0, True, 1),
        ("multipage", 0, False, 3),
    ]:
        with fitz.open() as output:
            for index in range(pages):
                with fitz.open() as text, fitz.open() as raster:
                    page = text.new_page(width=500, height=650)
                    lines = [
                        f"ORIENTATION WITNESS PAGE {index + 1}",
                        "French: français été déjà élève école.",
                        "English: The quick brown fox jumps.",
                        "Mixed document: café and summer.",
                        "Reading order first line.",
                        "Reading order second line.",
                    ]
                    for row, line in enumerate(lines):
                        page.insert_text(
                            (45, 90 + row * 50),
                            line,
                            fontsize=18,
                            color=(0.6, 0.6, 0.6) if contrast else (0, 0, 0),
                        )
                    image = page.get_pixmap(dpi=150, alpha=False).tobytes("png")
                    raster.new_page(width=500, height=650).insert_image(
                        page.rect, stream=image
                    )
                    width, height = (650, 500) if angle in (90, 270) else (500, 650)
                    target = output.new_page(width=width, height=height)
                    target.show_pdf_page(target.rect, raster, 0, rotate=-angle)
            output.save(FIXTURES / f"ocr-oriented-{name}.pdf", garbage=2, deflate=True)


if __name__ == "__main__":
    generate()
