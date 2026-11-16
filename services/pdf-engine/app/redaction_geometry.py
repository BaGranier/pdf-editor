"""Verify existing PDF.js search offsets against native glyphs; never re-search terms."""

import hashlib
import unicodedata
from collections import defaultdict

import fitz
from fastapi import HTTPException
from pydantic import BaseModel, Field, model_validator


class MatchProof(BaseModel):
    digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    start: int = Field(ge=0, le=2_000_000)
    end: int = Field(gt=0, le=2_000_000)
    text: str = Field(min_length=1, max_length=10_000)

    @model_validator(mode="after")
    def valid_range(self) -> "MatchProof":
        if self.end <= self.start:
            raise ValueError("Plage de caractères invalide.")
        return self


class RequestedMatch(BaseModel):
    id: str = Field(min_length=1, max_length=200)
    page: int = Field(ge=1)
    proof: MatchProof


class ResolveMatches(BaseModel):
    matches: list[RequestedMatch] = Field(min_length=1, max_length=2000)


def resolve_matches(source: bytes, request: ResolveMatches) -> dict:
    result = []
    by_page = defaultdict(list)
    for match in request.matches:
        by_page[match.page].append(match)
    try:
        with fitz.open(stream=source, filetype="pdf") as document:
            for number, matches in by_page.items():
                if number > len(document):
                    raise HTTPException(422, "Page de recherche absente du PDF source.")
                page = document[number - 1]
                page.set_rotation(0)
                glyphs = []
                raw = page.get_text(
                    "rawdict",
                    flags=fitz.TEXT_PRESERVE_LIGATURES | fitz.TEXT_PRESERVE_WHITESPACE,
                )
                for b, block in enumerate(raw["blocks"]):
                    for line_index, line in enumerate(block.get("lines", [])):
                        for span in line["spans"]:
                            for char in span["chars"]:
                                if not char["c"].isspace():
                                    glyphs.append(
                                        (
                                            char["c"],
                                            (b, line_index),
                                            fitz.Rect(char["bbox"]),
                                        )
                                    )
                text = "".join(item[0] for item in glyphs)
                if (
                    len(text) > 2_000_000
                    or unicodedata.normalize("NFC", text) != text
                    or any(
                        len(item[0]) != 1 or ord(item[0]) > 0xFFFF for item in glyphs
                    )
                ):
                    raise HTTPException(
                        422,
                        "Géométrie textuelle ambiguë (caractères composés/complexes). Utilisez le biffage manuel.",
                    )
                digest = hashlib.sha256(text.encode()).hexdigest()
                inverse = ~page.transformation_matrix
                for match in matches:
                    proof = match.proof
                    if (
                        proof.digest != digest
                        or proof.end > len(glyphs)
                        or text[proof.start : proof.end] != proof.text
                    ):
                        raise HTTPException(
                            409,
                            "La recherche et les glyphes PDF ne concordent pas. Aucune zone créée ; utilisez le biffage manuel.",
                        )
                    lines = defaultdict(list)
                    for _, key, box in glyphs[proof.start : proof.end]:
                        if box.is_empty or box.is_infinite:
                            raise HTTPException(
                                422, "Occurrence sans géométrie fiable."
                            )
                        lines[key].append(box)
                    rects = []
                    for boxes in lines.values():
                        box = fitz.Rect(boxes[0])
                        for other in boxes[1:]:
                            box |= other
                        box = (box + (-0.5, -0.5, 0.5, 0.5)) & page.rect
                        if box.is_empty:
                            raise HTTPException(422, "Occurrence hors page.")
                        box = box * inverse
                        rects.append(dict(zip(("x0", "y0", "x1", "y1"), box)))
                    result.append({"id": match.id, "page": number, "rects": rects})
        return {"matches": result}
    except HTTPException:
        raise
    except (RuntimeError, ValueError) as error:
        raise HTTPException(
            422, "Géométrie de recherche illisible ; aucune zone créée."
        ) from error
