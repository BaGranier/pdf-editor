export type PageRotation = 0 | 90 | 180 | 270;

/**
 * A page in the local export plan. A deleted page is simply absent from `pages`:
 * this makes the array directly usable as the future backend export payload.
 */
export type OrganizedPage = {
  id: string;
  sourceDocumentId: string;
  sourcePageIndex: number;
  displayPageNumber: number;
  rotation: PageRotation;
};

export type OrganizePagePlan = {
  sourceDocumentId: string;
  pages: OrganizedPage[];
};

export function createInitialPagePlan(sourceDocumentId: string, pageCount: number): OrganizePagePlan {
  return {
    sourceDocumentId,
    pages: Array.from({ length: pageCount }, (_, sourcePageIndex) => ({
      id: `${sourceDocumentId}:page:${sourcePageIndex}`,
      sourceDocumentId,
      sourcePageIndex,
      displayPageNumber: sourcePageIndex + 1,
      rotation: 0,
    })),
  };
}

export function renumberOrganizedPages(pages: OrganizedPage[]): OrganizedPage[] {
  return pages.map((page, index) => ({ ...page, displayPageNumber: index + 1 }));
}

export function moveOrganizedPageByIndex(
  pages: OrganizedPage[],
  fromIndex: number,
  toIndex: number,
): OrganizedPage[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= pages.length ||
    toIndex >= pages.length ||
    fromIndex === toIndex
  ) {
    return pages;
  }

  const nextPages = [...pages];
  const [movedPage] = nextPages.splice(fromIndex, 1);
  nextPages.splice(toIndex, 0, movedPage);
  return renumberOrganizedPages(nextPages);
}

export function rotatePage(rotation: PageRotation, delta: -90 | 90): PageRotation {
  return (((rotation + delta + 360) % 360) as PageRotation);
}

export function isPlanModified(plan: OrganizePagePlan, originalPageCount: number): boolean {
  if (plan.pages.length !== originalPageCount) {
    return true;
  }

  return plan.pages.some(
    (page, index) =>
      page.sourceDocumentId !== plan.sourceDocumentId ||
      page.sourcePageIndex !== index ||
      page.rotation !== 0,
  );
}

export function isValidPagePlanForDocument(
  plan: OrganizePagePlan,
  documentId: string,
  pageCount: number,
): boolean {
  if (plan.sourceDocumentId !== documentId) {
    return false;
  }

  const pageIds = new Set<string>();

  return plan.pages.every((page, index) => {
    if (
      pageIds.has(page.id) ||
      page.sourceDocumentId !== documentId ||
      !Number.isInteger(page.sourcePageIndex) ||
      page.sourcePageIndex < 0 ||
      page.sourcePageIndex >= pageCount ||
      page.displayPageNumber !== index + 1 ||
      !isPageRotation(page.rotation)
    ) {
      return false;
    }

    pageIds.add(page.id);
    return true;
  });
}

function isPageRotation(rotation: number): rotation is PageRotation {
  return rotation === 0 || rotation === 90 || rotation === 180 || rotation === 270;
}

// Future merge/insert support: pages may already point to a different source document.
// The backend only needs the ordered `pages` array plus access to the referenced source PDFs.
