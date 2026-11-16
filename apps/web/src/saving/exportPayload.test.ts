import { describe, expect, it } from "vitest";
import type { DocumentEditingState, PdfEditsByDocument } from "../editing/state";
import type { PdfEdit, SignatureImage } from "../editing/types";
import type { OrganizePagePlan } from "../organize/pagePlan";
import { buildPdfExportPayload, type PdfExportSourceDocument } from "./exportPayload";

const file = new File(["%PDF-1.4"], "source.pdf", { type: "application/pdf" });
const source: PdfExportSourceDocument = {
  id: "source",
  fileName: "source.pdf",
  workingSaveName: null,
  file,
  pageCount: 2,
};
const plan: OrganizePagePlan = {
  sourceDocumentId: "source",
  pages: [
    { id: "source:1", sourceDocumentId: "source", sourceDocumentName: "source.pdf", sourcePageIndex: 0, displayPageNumber: 1, rotation: 0 },
    { id: "source:2", sourceDocumentId: "source", sourceDocumentName: "source.pdf", sourcePageIndex: 1, displayPageNumber: 2, rotation: 90 },
  ],
};

function editingState(edits: PdfEdit[]): PdfEditsByDocument {
  const state: DocumentEditingState = {
    edits,
    isDirty: false,
    canUndo: false,
    canRedo: false,
    past: [],
    future: [],
    revision: 0,
    savedRevision: 0,
    nextRevision: 1,
    externalDirty: false, externalRevision: 0,
    coalescingKey: null,
  };
  return { source: state };
}

async function payloadFor(
  edits: PdfEdit[] = [],
  signatureImages: Record<string, SignatureImage> = {},
  resolveCustomFont?: NonNullable<Parameters<typeof buildPdfExportPayload>[0]["resolveCustomFont"]>,
) {
  return buildPdfExportPayload({
    documentId: "source",
    operation: "export",
    activeDocumentId: "source",
    outputName: "",
    saveToOutputDir: true,
    documents: [source],
    organizationPlans: { source: plan },
    editsByDocument: editingState(edits),
    signatureImages,
    resolveCustomFont,
  });
}

describe("buildPdfExportPayload", () => {
  it("exports redactions separately and includes local stamp assets in the common contract", async () => {
    const rect = { x0: 10, y0: 10, x1: 230, y1: 100 };
    const stamp: PdfEdit = { id: "s", type: "stamp", page: 2, rect, text: "", imageId: "asset", fontFamily: "Helvetica", fontSize: 20, color: "#b91c1c", rotation: 15, opacity: 0.5, border: false };
    const result = await payloadFor([{ id: "r", type: "redaction", page: 1, rect }, stamp], { asset: { id: "asset", mimeType: "image/png", dataUrl: "data:image/png;base64,YQ==", width: 1, height: 1 } });
    if (!result.ok) throw new Error(result.message);
    const exported = JSON.parse(String(result.formData.get("plan")));
    expect(exported.redactions).toEqual([expect.objectContaining({ type: "redaction", sourceDocumentId: "source", page: 1 })]);
    expect(exported.stamps).toEqual([expect.objectContaining({ type: "stamp", sourceDocumentId: "source", opacity: 0.5, rotation: 15 })]);
    expect(result.formData.getAll("imageFiles")).toHaveLength(1);
    expect(exported.signatureImages[0]).not.toHaveProperty("dataUrl");
    const missing = await payloadFor([stamp]);
    expect(missing.ok).toBe(false);
  });
  it("builds the common multipart payload for a simple organized document", async () => {
    const result = await payloadFor();
    if (!result.ok) throw new Error(result.message);
    expect(result.formData.getAll("files")).toHaveLength(1);
    expect(result.formData.get("documentIds")).toBe(JSON.stringify(["source"]));
    expect(JSON.parse(String(result.formData.get("plan")))).toMatchObject({
      outputName: "source-modifie.pdf",
      saveToOutputDir: true,
      pages: [
        { sourceDocumentId: "source", sourcePageIndex: 0, rotation: 0 },
        { sourceDocumentId: "source", sourcePageIndex: 1, rotation: 90 },
      ],
    });
  });

  it("serializes edits, AcroForm values and document-level form locks", async () => {
    const edits: PdfEdit[] = [
      {
        id: "text-1", type: "add_text", page: 1,
        rect: { x0: 10, y0: 10, x1: 100, y1: 40 }, text: "Bonjour",
        style: { fontFamily: "Noto Sans", fontSize: 12, color: "#000000", bold: false },
      },
      {
        id: "form-1", type: "form_field", page: 2,
        rect: { x0: 10, y0: 10, x1: 100, y1: 40 }, fieldName: "newsletter", value: "Yes",
      },
      {
        id: "lock-1", type: "form_lock", page: 1,
        rect: { x0: 0, y0: 0, x1: 0, y1: 0 }, locked: true,
      },
    ];
    const result = await payloadFor(edits);
    if (!result.ok) throw new Error(result.message);
    const exportedPlan = JSON.parse(String(result.formData.get("plan")));
    expect(exportedPlan.edits).toHaveLength(1);
    expect(exportedPlan.formValues).toEqual([
      { sourceDocumentId: "source", page: 2, fieldName: "newsletter", value: "Yes" },
    ]);
    expect(exportedPlan.formLocks).toEqual([{ sourceDocumentId: "source", locked: true }]);
  });

  it("keeps Save As output local to the selected name", async () => {
    const result = await buildPdfExportPayload({
      documentId: "source",
      operation: "save_as",
      requestedOutputName: "contrat.pdf",
      activeDocumentId: "source",
      outputName: "ignored.pdf",
      saveToOutputDir: true,
      documents: [source],
      organizationPlans: { source: plan },
      editsByDocument: editingState([]),
      signatureImages: {},
    });
    if (!result.ok) throw new Error(result.message);
    expect(JSON.parse(String(result.formData.get("plan")))).toMatchObject({
      outputName: "contrat.pdf",
      saveToOutputDir: false,
    });
  });

  it("keeps Save output local to its existing Desktop filename", async () => {
    const result = await buildPdfExportPayload({
      documentId: "source",
      operation: "save",
      requestedOutputName: "original.pdf",
      activeDocumentId: "source",
      outputName: "ignored.pdf",
      saveToOutputDir: true,
      documents: [source],
      organizationPlans: { source: plan },
      editsByDocument: editingState([]),
      signatureImages: {},
    });
    if (!result.ok) throw new Error(result.message);
    expect(JSON.parse(String(result.formData.get("plan")))).toMatchObject({
      outputName: "original.pdf",
      saveToOutputDir: false,
    });
  });

  it("includes custom font resources only when exported text uses them", async () => {
    const result = await payloadFor([
      {
        id: "custom-text", type: "add_text", page: 1,
        rect: { x0: 10, y0: 10, x1: 100, y1: 40 }, text: "Avec police",
        style: {
          fontFamily: "Custom", fontRef: "custom:font-1", fontSize: 12,
          color: "#000000", bold: false,
        },
      },
    ], {}, async () => ({
      id: "font-1",
      sha256: "sha256",
      format: "ttf",
      originalFileName: "custom.ttf",
      binary: new Blob(["font"], { type: "font/ttf" }),
    }));
    if (!result.ok) throw new Error(result.message);
    expect(JSON.parse(String(result.formData.get("plan"))).fontResources).toEqual([
      expect.objectContaining({
        id: "font-1",
        sha256: "sha256",
        format: "ttf",
        fileName: "custom.ttf",
        dataUrl: expect.stringMatching(/^data:/),
      }),
    ]);
  });
});

it("blocks a missing signature asset instead of silently dropping the signature",async()=>{
  const result=await payloadFor([{id:"missing-signature",type:"signature",imageId:"absent",page:1,rect:{x0:0,y0:0,x1:50,y1:30}}]);
  expect(result.ok).toBe(false);
});
