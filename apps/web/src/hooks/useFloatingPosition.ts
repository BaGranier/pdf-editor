import { useLayoutEffect, type RefObject } from "react";
import { FLOATING_MARGIN, floatingPosition, type FloatingPlacement } from "../viewer/floatingPosition";

type Anchor = HTMLElement | Range;
type AnchorSource = RefObject<HTMLElement | null> | Anchor | null;

export function useFloatingPosition(
  open: boolean,
  source: AnchorSource,
  surface: RefObject<HTMLElement | null>,
  placement: FloatingPlacement,
  onAnchorHidden?: (open: false) => void,
) {
  useLayoutEffect(() => {
    const anchor = source && "current" in source ? source.current : source;
    const panel = surface.current;
    if (!open || !anchor || !panel) return;
    const ancestor = anchor instanceof Range ? anchor.commonAncestorContainer : anchor;
    const element = ancestor instanceof HTMLElement ? ancestor : ancestor.parentElement;
    let frame = 0;
    const visual = window.visualViewport;
    const place = () => {
      if (element && (!element.isConnected || element.matches(":disabled, [hidden]"))) {
        onAnchorHidden?.(false);
        return;
      }
      const root = document.documentElement;
      const viewport = {
        left: visual?.offsetLeft ?? 0,
        top: visual?.offsetTop ?? 0,
        width: Math.min(visual?.width || window.innerWidth, root.clientWidth || window.innerWidth),
        height: Math.min(visual?.height || window.innerHeight, root.clientHeight || window.innerHeight),
      };
      const bounds = anchor.getBoundingClientRect();
      if (anchor instanceof Range && (bounds.width <= 0 || bounds.bottom <= viewport.top ||
          bounds.top >= viewport.top + viewport.height || bounds.right <= viewport.left ||
          bounds.left >= viewport.left + viewport.width)) {
        onAnchorHidden?.(false);
        return;
      }
      // DOMRect is in viewport CSS pixels, including CSS zoom. Fixed offsets use the panel's own scale.
      const zoom = panel.currentCSSZoom || parseFloat(getComputedStyle(root).zoom) || 1;
      panel.style.setProperty("--floating-width", `${Math.max(0, viewport.width - 2 * FLOATING_MARGIN) / zoom}px`);
      panel.style.setProperty("--floating-height", `${Math.max(0, viewport.height - 2 * FLOATING_MARGIN) / zoom}px`);
      const { top, left } = floatingPosition(bounds, panel.getBoundingClientRect(), viewport, placement);
      panel.style.top = `${top / zoom}px`;
      panel.style.left = `${left / zoom}px`;
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    resize?.observe(panel);
    if (element) resize?.observe(element);
    const intersection = onAnchorHidden && element && typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) onAnchorHidden(false);
      })
      : null;
    if (element) intersection?.observe(element);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    visual?.addEventListener("resize", schedule);
    visual?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      intersection?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      visual?.removeEventListener("resize", schedule);
      visual?.removeEventListener("scroll", schedule);
    };
  }, [open, source, surface, placement, onAnchorHidden]);
}

export function floatingPortalTarget(anchor: HTMLElement | null) {
  return anchor?.closest('[aria-modal="true"]')?.parentElement ?? document.fullscreenElement ?? document.body;
}
