import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PageViewport } from "pdfjs-dist";
import { NativeTextLayer, textAreaHasOverflow } from "./NativeTextLayer";
import type { NativeTextSpan } from "../pdf/nativeText";
import type { NativeTextEdit } from "../editing/types";

const viewport = {
  transform: [1, 0, 0, -1, 0, 200],
  viewBox: [0, 0, 200, 200],
  convertToViewportPoint: (x: number, y: number) => [x, 200 - y],
  convertToPdfPoint: (x: number, y: number) => [x, 200 - y],
} as unknown as PageViewport;

const span: NativeTextSpan = {
  page: 1,
  rect: { x0: 20, y0: 100, x1: 150, y1: 120 },
  sourceId: "p0-b0-l0-s0",
  sourceText: "Montant : 1 250 €",
  sourceBBox: { x0: 20, y0: 100, x1: 150, y1: 120 },
  sourceOrigin: { x: 20, y: 103 },
  sourceFontName: "Helvetica",
  sourceFontSize: 11,
  sourceColor: "#111827",
  sourceRotation: 0,
  sourceFingerprint: "a".repeat(64),
  editable: true,
  fontWeight: 400,
  fontStyle: "normal",
};

describe("NativeTextLayer", () => {
  it("detects overflow without truncating the editable value", () => {
    const textarea = document.createElement("textarea");
    Object.defineProperties(textarea, {
      clientHeight: { value: 20 },
      clientWidth: { value: 100 },
      scrollHeight: { value: 42 },
      scrollWidth: { value: 100 },
    });
    expect(textAreaHasOverflow(textarea)).toBe(true);
  });

  it("selects without mutation, cancels with Escape and commits explicitly", () => {
    const onCreateEdit = vi.fn();
    render(
      <NativeTextLayer
        spans={[span]}
        edits={[]}
        viewport={viewport}
        selectedEditId={null}
        onCreateEdit={onCreateEdit}
        onSelectEdit={vi.fn()}
        onUpdateEdit={vi.fn()}
        onPreviewChange={vi.fn()}
      />,
    );
    const hitbox = screen.getByRole("button", { name: /Modifier le texte/ });
    fireEvent.click(hitbox);
    expect(onCreateEdit).not.toHaveBeenCalled();

    fireEvent.doubleClick(hitbox);
    const input = screen.getByRole("textbox", { name: /Modifier le texte PDF/ });
    fireEvent.change(input, { target: { value: "Montant : 1 375 €" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCreateEdit).not.toHaveBeenCalled();

    fireEvent.doubleClick(screen.getByRole("button", { name: /Modifier le texte/ }));
    const reopened = screen.getByRole("textbox", { name: /Modifier le texte PDF/ });
    fireEvent.change(reopened, { target: { value: "Montant : 1 375 €" } });
    fireEvent.keyDown(reopened, { key: "Enter", ctrlKey: true });
    expect(onCreateEdit).toHaveBeenCalledTimes(1);
    expect(onCreateEdit).toHaveBeenCalledWith(span, "Montant : 1 375 €");
  }, 15_000);

  it("keeps a persistent, accessible diagnostic around an edit whose font is unavailable", () => {
    const edit: NativeTextEdit = {
      id: "native-edit",
      type: "native_text",
      page: 1,
      rect: span.rect,
      source: span,
      text: "Montant : 1 375 €",
      style: { fontFamily: "Aptos", fontRef: "custom:missing", fontSize: 11, color: "#111827", bold: false },
    };
    render(
      <NativeTextLayer
        spans={[span]}
        edits={[edit]}
        viewport={viewport}
        selectedEditId={null}
        onCreateEdit={vi.fn()}
        onSelectEdit={vi.fn()}
        onUpdateEdit={vi.fn()}
        onPreviewChange={vi.fn()}
        isBackgroundReady
        fontValidationByEditId={{
          [edit.id]: { status: "missing", fontRef: "custom:missing", message: "Police manquante : « Aptos ». Importez le fichier .ttf ou .otf correspondant." },
        }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Police manquante : « Aptos »");
    expect(document.querySelector(".native-text-font-diagnostic")).toBeTruthy();
  });
});
