import { beforeEach, describe, expect, it } from "vitest";
import {
  clearViewerStorage,
  loadOrganizationPlan,
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

  it("creates a stored pdf document snapshot", async () => {
    const snapshot: ViewerDocumentSnapshot = {
      id: "pdf-1",
      fileName: "sample.pdf",
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
      mimeType: "application/pdf",
      content: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
      pageCount: 1,
      zoom: 1.5,
      scrollLeft: 12,
      scrollTop: 24,
    };

    await saveStoredDocument(snapshot);

    await expect(loadStoredDocument("pdf-restore")).resolves.toMatchObject({
      id: "pdf-restore",
      fileName: "restore.pdf",
      pageCount: 1,
      zoom: 1.5,
      scrollLeft: 12,
      scrollTop: 24,
    });
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
});
