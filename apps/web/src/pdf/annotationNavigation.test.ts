import { describe, expect, it } from "vitest";
import { getAnnotationScrollTop } from "./annotationNavigation";

describe("getAnnotationScrollTop", () => {
  it("centres an annotation in the PDF viewport", () => {
    expect(getAnnotationScrollTop({ annotationTop: 1_200, annotationHeight: 22, viewportHeight: 600, scrollHeight: 3_000 })).toBe(911);
  });

  it("clamps annotations near the start and end of the document", () => {
    expect(getAnnotationScrollTop({ annotationTop: 20, annotationHeight: 22, viewportHeight: 600, scrollHeight: 3_000 })).toBe(0);
    expect(getAnnotationScrollTop({ annotationTop: 2_980, annotationHeight: 22, viewportHeight: 600, scrollHeight: 3_000 })).toBe(2_400);
  });
});
