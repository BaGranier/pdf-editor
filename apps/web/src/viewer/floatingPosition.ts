const EDGE_MARGIN = 8;

export function sidePanelPosition(
  anchor: Pick<DOMRect, "top" | "left" | "right" | "height">,
  panel: { width: number; height: number },
  viewport: { width: number; height: number },
  centerVertically: boolean,
) {
  const right = anchor.right + EDGE_MARGIN;
  const left = anchor.left - EDGE_MARGIN - panel.width;
  const maxLeft = viewport.width - panel.width - EDGE_MARGIN;
  const maxTop = viewport.height - panel.height - EDGE_MARGIN;
  const preferredLeft = right <= maxLeft || left < EDGE_MARGIN ? right : left;
  const preferredTop = anchor.top + (centerVertically ? (anchor.height - panel.height) / 2 : 0);
  return {
    left: Math.max(EDGE_MARGIN, Math.min(preferredLeft, maxLeft)),
    top: Math.max(EDGE_MARGIN, Math.min(preferredTop, maxTop)),
  };
}
