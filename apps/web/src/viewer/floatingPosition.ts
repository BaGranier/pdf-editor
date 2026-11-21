export type FloatingPlacement = "right-start" | "right-center" | "bottom-end" | "top-center";
export type FloatingAnchor = Pick<DOMRect, "top" | "left" | "right" | "height" | "width">;
export type FloatingViewport = { width: number; height: number; left?: number; top?: number };

export const FLOATING_MARGIN = 8;

export function floatingPosition(
  anchor: FloatingAnchor,
  panel: { width: number; height: number },
  viewport: FloatingViewport,
  placement: FloatingPlacement,
) {
  const margin = FLOATING_MARGIN;
  const minLeft = (viewport.left ?? 0) + margin;
  const minTop = (viewport.top ?? 0) + margin;
  const maxLeft = minLeft + viewport.width - 2 * margin - panel.width;
  const maxTop = minTop + viewport.height - 2 * margin - panel.height;
  const bottom = anchor.top + anchor.height;
  let left: number;
  let top: number;
  if (placement === "right-start" || placement === "right-center") {
    const right = anchor.right + margin;
    const leftSide = anchor.left - margin - panel.width;
    left = right <= maxLeft || leftSide < minLeft ? right : leftSide;
    top = anchor.top + (placement === "right-center" ? (anchor.height - panel.height) / 2 : 0);
  } else {
    const below = bottom + margin;
    const above = anchor.top - margin - panel.height;
    const preferTop = placement === "top-center";
    const first = preferTop ? above : below;
    const second = preferTop ? below : above;
    const fits = (y: number) => y >= minTop && y <= maxTop;
    top = fits(first) || !fits(second) ? first : second;
    left = preferTop ? anchor.left + (anchor.width - panel.width) / 2 : anchor.right - panel.width;
  }
  return {
    left: Math.max(minLeft, Math.min(left, maxLeft)),
    top: Math.max(minTop, Math.min(top, maxTop)),
  };
}
