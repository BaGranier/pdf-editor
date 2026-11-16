import math
import fitz
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from app import main
from test_redaction_search import proof_for, export_resolved
from test_secure_redaction import SECRET, assert_no_secret


def watermark(page=1, width=400, height=600, **extra):
    return {
        "id": f"w-{page}",
        "type": "stamp",
        "purpose": "watermark",
        "layoutVersion": 2,
        "groupId": "group",
        "page": page,
        "rect": {"x0": 0, "y0": 0, "x1": width, "y1": height},
        "text": "CONFIDENTIEL",
        "fontFamily": "Helvetica",
        "fontSizeMode": "fit",
        "fontSize": 72,
        "color": "#b91c1c",
        "rotation": -45,
        "opacity": 0.25,
        "watermarkScale": 0.9,
        "paddingRatio": 0.04,
        "border": False,
        "fillOpacity": 0,
        **extra,
    }


def test_full_page_watermarks_are_vector_printable_and_preserve_originals():
    with fitz.open() as doc:
        marks = []
        for number, (width, height, rotation) in enumerate(
            [(595, 842, 0), (842, 595, 0), (595, 842, 90), (595, 842, 270)]
        ):
            page = doc.new_page(width=width, height=height)
            page.insert_text((40, 100), SECRET)
            page.set_rotation(rotation)
            marks.append(watermark(number + 1, width, height))
        source = doc.tobytes()
    plan = main.OrganizeExportPlan.model_validate(
        {"pages": [{"sourcePageIndex": i} for i in range(4)], "stamps": marks}
    )
    output = main.export_organized_pdf({"source": source}, plan)
    with fitz.open(stream=output, filetype="pdf") as doc:
        for page in doc:
            assert SECRET in page.get_text()
            assert "CONFIDENTIEL" in page.get_text()
            assert not list(page.annots() or [])
            traces = [
                span
                for span in page.get_texttrace()
                if span["opacity"] == pytest.approx(0.25)
            ]
            assert traces
            assert abs(traces[0]["dir"][0]) == pytest.approx(2**-0.5, abs=0.001)
            assert abs(traces[0]["dir"][1]) == pytest.approx(2**-0.5, abs=0.001)
            assert traces[0]["size"] > 50
            assert page.get_pixmap().samples


def test_range_two_to_four_and_combination_with_secure_redaction():
    with fitz.open() as doc:
        matches = []
        for number in range(5):
            page = doc.new_page(width=400, height=600)
            page.insert_text((40, 100), SECRET)
            matches.append(proof_for(doc, number, SECRET))
        source = doc.tobytes()
    marks = [watermark(page, text="BROUILLON") for page in [2, 3, 4]]
    output = export_resolved(source, matches, stamps=marks)
    assert_no_secret(output)
    with fitz.open(stream=output, filetype="pdf") as doc:
        for index, page in enumerate(doc):
            assert ("BROUILLON" in page.get_text()) == (index in [1, 2, 3])


def test_visual_mask_leaves_secret_extractible():
    with fitz.open() as doc:
        doc.new_page(width=400, height=600).insert_text((40, 100), SECRET)
        source = doc.tobytes()
    plan = main.OrganizeExportPlan.model_validate(
        {
            "pages": [{"sourcePageIndex": 0}],
            "shapes": [
                {
                    "id": "mask",
                    "type": "shape",
                    "visualMask": True,
                    "page": 1,
                    "shapeType": "rectangle",
                    "rect": {"x0": 30, "y0": 480, "x1": 240, "y1": 520},
                    "style": {
                        "strokeColor": "#000000",
                        "fillColor": "#000000",
                        "strokeWidth": 1,
                        "opacity": 1,
                    },
                }
            ],
        }
    )
    output = main.export_organized_pdf({"source": source}, plan)
    with fitz.open(stream=output, filetype="pdf") as doc:
        assert SECRET in doc[0].get_text()
        assert doc[0].get_pixmap().pixel(50, 100) == (0, 0, 0)


@pytest.mark.parametrize(
    "patch",
    [
        {"rotation": float("nan")},
        {"offsetX": 1},
        {"watermarkScale": 0},
        {"purpose": "redaction"},
        {"border": True},
        {"fillOpacity": 0.1},
        {"layoutVersion": None},
    ],
)
def test_invalid_watermark_rejected(patch):
    with pytest.raises(ValidationError):
        main.StampEdit.model_validate(watermark(**patch))


def test_manual_watermark_overflow_refused():
    with fitz.open() as doc:
        page = doc.new_page(width=400, height=600)
        edit = main.StampEdit.model_validate(
            watermark(fontSizeMode="manual", fontSize=144, text="X" * 200)
        )
        with pytest.raises(HTTPException):
            main._insert_stamp(page, page.rect, edit, {})


@pytest.mark.parametrize("pages", [[2], [1, 2, 3, 4]])
def test_tiled_watermarks_target_pages_and_preserve_vector_source(pages):
    dimensions = [(595, 842, 0), (842, 595, 0), (595, 842, 90), (460, 510, 270)]
    with fitz.open() as doc:
        for width, height, rotation in dimensions:
            page = doc.new_page(width=width, height=height)
            page.insert_text((40, 100), "ORIGINAL_PUBLIC_TEXT")
            page.set_rotation(rotation)
        source = doc.tobytes()
    marks = [
        watermark(
            page,
            dimensions[page - 1][0],
            dimensions[page - 1][1],
            text="Test",
            watermarkMode="tiled",
            fontSizeMode="manual",
            fontSize=18,
            rotation=-30 if page % 2 else 30,
            color="#8899aa",
        )
        for page in pages
    ]
    plan = main.OrganizeExportPlan.model_validate(
        {"pages": [{"sourcePageIndex": i} for i in range(4)], "stamps": marks}
    )
    output = main.export_organized_pdf({"source": source}, plan)
    with fitz.open(stream=output, filetype="pdf") as doc:
        for index, page in enumerate(doc):
            assert "ORIGINAL_PUBLIC_TEXT" in page.get_text()
            assert not page.get_images()
            assert not list(page.annots() or [])
            spans = [
                span
                for span in page.get_texttrace()
                if span["opacity"] == pytest.approx(0.25)
            ]
            if index + 1 not in pages:
                assert not spans
                continue
            assert len(spans) > 20
            assert abs(spans[0]["dir"][0]) == pytest.approx(
                math.cos(math.radians(30)), abs=0.001
            )
            assert spans[0]["size"] == pytest.approx(18)
            assert spans[0]["color"] == pytest.approx(
                (0x88 / 255, 0x99 / 255, 0xAA / 255), abs=0.005
            )
            assert page.get_text().count("Test") > 20
            assert page.get_pixmap().samples
    with fitz.open(stream=source, filetype="pdf") as original:
        assert "Test" not in "".join(page.get_text() for page in original)


@pytest.mark.parametrize(
    "tile",
    [
        {"horizontalGapPt": 0},
        {"verticalGapPt": -1},
        {"offsetXPt": float("nan")},
        {"offsetYPt": 721},
    ],
)
def test_tiling_rejects_invalid_lengths(tile):
    with pytest.raises(ValidationError):
        main.StampEdit.model_validate(
            watermark(watermarkMode="tiled", fontSizeMode="manual", tile=tile)
        )


def test_tiling_rejects_excessive_density_before_insertion():
    with fitz.open() as doc:
        page = doc.new_page(width=595, height=842)
        edit = main.StampEdit.model_validate(
            watermark(
                width=595,
                height=842,
                text="I",
                fontSize=6,
                fontSizeMode="manual",
                watermarkMode="tiled",
                tile={"horizontalGapPt": 8, "verticalGapPt": 8},
            )
        )
        with pytest.raises(HTTPException, match="800"):
            main._insert_stamp(page, page.rect, edit, {})
        assert not page.get_text()


def test_tiled_250_pages_size_and_runtime():
    import time

    started = time.perf_counter()
    with fitz.open() as doc:
        for _ in range(250):
            doc.new_page(width=595, height=842).insert_text((40, 100), "SOURCE_PUBLIC")
        source = doc.tobytes()
    plan = main.OrganizeExportPlan.model_validate(
        {
            "pages": [{"sourcePageIndex": i} for i in range(250)],
            "stamps": [
                watermark(
                    i + 1,
                    595,
                    842,
                    text="TEST",
                    fontSize=18,
                    fontSizeMode="manual",
                    watermarkMode="tiled",
                    rotation=-30,
                )
                for i in range(250)
            ],
        }
    )
    output = main.export_organized_pdf({"source": source}, plan)
    assert len(output) < 12_000_000
    with fitz.open(stream=output, filetype="pdf") as doc:
        assert len(doc) == 250
        assert all(
            "SOURCE_PUBLIC" in page.get_text() and page.get_text().count("TEST") > 20
            for page in doc
        )
    print(f"250 tiled pages: {len(output)} bytes, {time.perf_counter() - started:.2f}s")


def test_tiled_geometry_matches_browser_contract():
    import json
    from pathlib import Path
    from app.watermark_tiling import layout_watermark_tiles

    samples = json.loads(
        (
            Path(__file__).resolve().parents[3]
            / "apps/web/src/editing/watermarkTiling.cases.json"
        ).read_text()
    )
    font = fitz.Font(
        fontfile=str(
            main.BUNDLED_FONT_DIR
            / main.BUNDLED_FONT_FILES["bundled:noto-sans:400:normal"]
        )
    )
    for sample in samples:
        count, lines = layout_watermark_tiles(
            sample["text"],
            font,
            sample["width"],
            sample["height"],
            18,
            sample["rotation"],
            48,
            64,
            sample["offsetXPt"],
            sample["offsetYPt"],
        )
        assert count == sample["count"]
        for line, expected in [
            (lines[0], sample["first"]),
            (lines[-1], sample["last"]),
        ]:
            assert line[0] == expected[0]
            assert line[1:] == pytest.approx(expected[1:])


@pytest.mark.parametrize("opacity", [0, 1])
def test_tiled_opacity_cropbox_and_edge_coverage(opacity):
    with fitz.open() as doc:
        page = doc.new_page(width=655, height=902)
        page.set_cropbox(fitz.Rect(30, 30, 625, 872))
        page.insert_text((40, 100), "PUBLIC_CROP_SOURCE")
        source = doc.tobytes()
    # Native PDF coordinates for the visible CropBox, as returned by PDF.js.
    mark = watermark(
        1,
        595,
        842,
        text="Test",
        fontSize=18,
        fontSizeMode="manual",
        watermarkMode="tiled",
        rotation=-30,
        opacity=opacity,
        tile={"horizontalGapPt": 24, "verticalGapPt": 24},
    )
    mark["rect"] = {"x0": 30, "y0": 30, "x1": 625, "y1": 872}
    output = main.export_organized_pdf(
        {"source": source},
        main.OrganizeExportPlan.model_validate(
            {"pages": [{"sourcePageIndex": 0}], "stamps": [mark]}
        ),
    )
    with fitz.open(stream=output, filetype="pdf") as doc:
        page = doc[0]
        assert "PUBLIC_CROP_SOURCE" in page.get_text()
        assert not page.get_images()
        pix = page.get_pixmap()
        # Each corner region contains the diagonal pattern, with final clipping at the CropBox.
        for x, y in [
            (0, 0),
            (pix.width - 100, 0),
            (0, pix.height - 100),
            (pix.width - 100, pix.height - 100),
        ]:
            colored = sum(
                pix.pixel(i, j)[0] > pix.pixel(i, j)[1] + 5
                for i in range(x, x + 100)
                for j in range(y, y + 100)
            )
            assert (colored > 10) == bool(opacity)
