export const PAGE_ROW_GAP = 32;

export function isMultipageMode(mode: string) {
  return mode === "facing" || mode === "adaptive";
}

export function isScrollingMode(mode: string) {
  return mode === "continuous" || isMultipageMode(mode);
}

export function facingSpreadSize(pages: readonly { width: number; height: number }[]) {
  const columnWidths = [0, 0];
  let maxHeight = 0;
  pages.forEach(({ width, height }, index) => {
    // A lone final page spans both grid tracks.
    if (pages.length === 1 || index !== pages.length - 1 || index % 2 !== 0) {
      columnWidths[index % 2] = Math.max(columnWidths[index % 2], width);
    }
    maxHeight = Math.max(maxHeight, height);
  });
  const lonePageWidth = pages.length % 2 ? pages[pages.length - 1].width : 0;
  return { width: Math.max(columnWidths[0] + columnWidths[1], lonePageWidth), height: maxHeight };
}
