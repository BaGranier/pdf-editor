import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearViewerStorage,
  loadOrganizationPlan,
  loadImageAssets,
  removeStoredDocument,
  loadStoredDocument,
  loadViewerPreferences,
  parseViewerPreferences,
  removeOrganizationPlan,
  saveOrganizationPlan,
  saveStoredDocument,
  saveViewerPreferences,
  serializeViewerPreferences,
  toStoredPdfDocument,
  type ViewerDocumentSnapshot,
} from "./viewerStorage";
import { createInitialPagePlan } from "../organize/pagePlan";

describe("viewerStorage", () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearViewerStorage();
  });

  it("serializes and parses viewer preferences", () => {
    const preferences = {
      theme: "dark" as const,
      sidebarVisible: false,
      activeDocumentId: "pdf-1",
      documentOrder: ["pdf-1", "pdf-2"],
      viewerMode: "single-page" as const,
    };

    const serialized = serializeViewerPreferences(preferences);

    expect(parseViewerPreferences(serialized)).toEqual(preferences);
  });

  it("persists viewer preferences in localStorage", () => {
    saveViewerPreferences({
      theme: "light",
      sidebarVisible: true,
      activeDocumentId: "pdf-2",
      documentOrder: ["pdf-1", "pdf-2"],
    });

    expect(loadViewerPreferences()).toEqual({
      theme: "light",
      sidebarVisible: true,
      activeDocumentId: "pdf-2",
      documentOrder: ["pdf-1", "pdf-2"],
    });
  });

  it("persists the last locally-entered comment author without requiring one", () => {
    const preferences = {
      theme: "light" as const, sidebarVisible: true, activeDocumentId: null,
      documentOrder: [], commentAuthor: "Baptiste Granier",
    };
    saveViewerPreferences(preferences);
    expect(loadViewerPreferences()).toEqual(preferences);
  });

  it("creates a stored pdf document snapshot", async () => {
    const snapshot: ViewerDocumentSnapshot = {
      id: "pdf-1",
      fileName: "sample.pdf",
      workingSaveName: null,
      mimeType: "application/pdf",
      content: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
      pageCount: 3,
      zoom: 1.25,
      scrollLeft: 40,
      scrollTop: 120,
    };

    const stored = toStoredPdfDocument(snapshot);

    expect(stored).toMatchObject({
      id: "pdf-1",
      fileName: "sample.pdf",
      mimeType: "application/pdf",
      pageCount: 3,
      zoom: 1.25,
      scrollLeft: 40,
      scrollTop: 120,
    });
    expect(stored.content).toBeInstanceOf(Blob);
  });

  it("stores pdf documents in the fallback store when IndexedDB is unavailable", async () => {
    const snapshot: ViewerDocumentSnapshot = {
      id: "pdf-restore",
      fileName: "restore.pdf",
      workingSaveName: "restore-final.pdf",
      mimeType: "application/pdf",
      content: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
      pageCount: 1,
      zoom: 1.5,
      scrollLeft: 12,
      scrollTop: 24,
    };

    await expect(saveStoredDocument(snapshot)).resolves.toBe(false);

    await expect(loadStoredDocument("pdf-restore")).resolves.toMatchObject({
      id: "pdf-restore",
      fileName: "restore.pdf",
      workingSaveName: "restore-final.pdf",
      pageCount: 1,
      zoom: 1.5,
      scrollLeft: 12,
      scrollTop: 24,
    });
  });

  it("reports localStorage write failures without throwing", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    expect(
      saveViewerPreferences({
        theme: "light",
        sidebarVisible: true,
        activeDocumentId: null,
        documentOrder: [],
      }),
    ).toBe(false);
    expect(
      saveOrganizationPlan("pdf-plan", {
        plan: createInitialPagePlan("pdf-plan", "plan.pdf", 1),
        selectedPageId: null,
      }),
    ).toBe(false);

    setItem.mockRestore();
  });

  it("persists and removes a local organization plan", () => {
    const plan = createInitialPagePlan("pdf-plan", "plan.pdf", 2);
    plan.pages[0].rotation = 90;

    saveOrganizationPlan("pdf-plan", {
      plan,
      selectedPageId: plan.pages[0].id,
    });

    expect(loadOrganizationPlan("pdf-plan")).toEqual({
      plan,
      selectedPageId: plan.pages[0].id,
    });

    removeOrganizationPlan("pdf-plan");
    expect(loadOrganizationPlan("pdf-plan")).toBeNull();
  });

  it("clears viewer storage across preferences and stored documents", async () => {
    saveViewerPreferences({
      theme: "dark",
      sidebarVisible: false,
      activeDocumentId: "pdf-1",
      documentOrder: ["pdf-1"],
    });

    await saveStoredDocument({
      id: "pdf-1",
      fileName: "sample.pdf",
      mimeType: "application/pdf",
      content: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
      pageCount: 1,
      zoom: 1,
      scrollLeft: 0,
      scrollTop: 0,
    });

    await clearViewerStorage();

    expect(loadViewerPreferences()).toBeNull();
    await expect(loadStoredDocument("pdf-1")).resolves.toBeNull();
  });
  it("stores shared image assets separately and prunes after the last document is removed", async () => {
    const asset = { id: "shared", mimeType: "image/png" as const, width: 60, height: 30, dataUrl: "data:image/png;base64,fixture" };
    const snapshot: ViewerDocumentSnapshot = { id: "one", fileName: "one.pdf", mimeType: "application/pdf", content: new Blob(["%PDF"]), pageCount: 1, zoom: 1, scrollLeft: 0, scrollTop: 0, editsDirty: true, edits: [{ id: "edit", type: "image", imageId: "shared", page: 1, rect: { x0: 0, y0: 0, x1: 60, y1: 30 } }], imageAssets: [asset] };
    await saveStoredDocument(snapshot);
    await saveStoredDocument({ ...snapshot, id: "two" });
    expect(await loadImageAssets(["shared"])).toEqual({ shared: asset });
    const stored = await loadStoredDocument("one");
    expect(stored).toMatchObject({ editsDirty: true, edits: snapshot.edits });
    expect(stored).not.toHaveProperty("imageAssets");
    await removeStoredDocument("one"); expect(await loadImageAssets(["shared"])).toEqual({ shared: asset });
    await removeStoredDocument("two"); expect(await loadImageAssets(["shared"])).toEqual({});
  });

});
