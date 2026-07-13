import { describe, expect, it } from "vitest";
import {
  createInitialPagePlan,
  isValidPagePlanForDocument,
  moveOrganizedPageByIndex,
} from "./pagePlan";

describe("pagePlan", () => {
  it("moves a page and renumbers the resulting plan", () => {
    const plan = createInitialPagePlan("pdf-1", 3);

    const pages = moveOrganizedPageByIndex(plan.pages, 2, 0);

    expect(pages.map((page) => page.sourcePageIndex)).toEqual([2, 0, 1]);
    expect(pages.map((page) => page.displayPageNumber)).toEqual([1, 2, 3]);
  });

  it("rejects a plan that cannot be restored for its source document", () => {
    const plan = createInitialPagePlan("pdf-1", 2);
    plan.pages[0].sourcePageIndex = 3;

    expect(isValidPagePlanForDocument(plan, "pdf-1", 2)).toBe(false);
  });
});
