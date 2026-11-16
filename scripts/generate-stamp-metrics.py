"""Generate browser layout metrics from the exact bundled PDF font files."""

import sys
import json
from pathlib import Path
import fitz

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "services/pdf-engine"))
from app.stamp_font_metrics import measured_glyphs  # noqa: E402

fonts = {
    "Helvetica": ("noto-sans", "Noto Sans", "NotoSans-Regular.ttf"),
    "Times": ("liberation-serif", "Liberation Serif", "LiberationSerif-Regular.ttf"),
    "Courier": ("liberation-mono", "Liberation Mono", "LiberationMono-Regular.ttf"),
}
result = {}
for family, (slug, css, filename) in fonts.items():
    font = fitz.Font(fontfile=str(root / "apps/web/public/fonts" / filename))
    result[family] = {
        "fontRef": f"bundled:{slug}:400:normal",
        "cssFamily": css,
        "glyphs": {
            str(code): glyph
            for code, glyph in measured_glyphs(
                font, {code for code in range(32, 256) if not 127 <= code < 160}
            ).items()
        },
    }
(root / "apps/web/src/editing/stampMetrics.generated.json").write_text(
    json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n"
)
