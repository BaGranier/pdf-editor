"""Generate a small, entirely synthetic two-page redaction/stamp QA document."""

from pathlib import Path
import fitz

output = (
    Path(__file__).resolve().parents[1] / "apps/web/e2e/fixtures/redaction-stamps.pdf"
)
with fitz.open() as document:
    for number in range(2):
        page = document.new_page(width=400, height=400)
        page.insert_text((40, 110), "SECRET_TEST_12345", fontsize=12)
        page.insert_text((40, 220), f"PUBLIC_NEIGHBOR_PAGE_{number + 1}", fontsize=12)
    document.save(output, garbage=4, deflate=True, no_new_id=True)
