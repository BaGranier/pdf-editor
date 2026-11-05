import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

const MARGIN = 8;
const GAP = 6;

export function placePopover(anchor: { left: number; top: number; bottom: number }, width: number, height: number, viewportWidth: number, viewportHeight: number) {
  const maxWidth = Math.max(0, viewportWidth - MARGIN * 2);
  const maxHeight = Math.max(0, viewportHeight - MARGIN * 2);
  const renderedHeight = Math.min(height, maxHeight);
  const below = anchor.bottom + GAP;
  const above = anchor.top - GAP - renderedHeight;
  const preferredTop = below + renderedHeight <= viewportHeight - MARGIN
    ? below
    : above >= MARGIN ? above : below;
  return {
    left: Math.max(MARGIN, Math.min(anchor.left, viewportWidth - MARGIN - Math.min(width, maxWidth))),
    top: Math.max(MARGIN, Math.min(preferredTop, viewportHeight - MARGIN - renderedHeight)),
    maxWidth,
    maxHeight,
  };
}

/** Measures actual content; portals escape toolbar overflow and stacking contexts. */
export function ViewportPopover({ anchorRef, onClose, children, className, role = "dialog", label }: {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  className: string;
  role?: "menu" | "dialog";
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const element = ref.current;
    const anchor = anchorRef.current;
    if (!element || !anchor) return;
    const update = () => {
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const offsetLeft = viewport?.offsetLeft ?? 0;
      const offsetTop = viewport?.offsetTop ?? 0;
      // Constrain first so wrapped content is measured at its final width.
      element.style.maxWidth = `${Math.max(0, width - MARGIN * 2)}px`;
      const bounds = element.getBoundingClientRect();
      const trigger = anchor.getBoundingClientRect();
      const placed = placePopover({ left: trigger.left - offsetLeft, top: trigger.top - offsetTop, bottom: trigger.bottom - offsetTop }, bounds.width, element.scrollHeight + (bounds.height - element.clientHeight), width, height);
      setPosition({ ...placed, left: placed.left + offsetLeft, top: placed.top + offsetTop });
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    observer?.observe(element);
    observer?.observe(anchor);
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !element.contains(event.target) && !anchor.contains(event.target)) closeRef.current();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        anchor.focus();
      } else if (role === "menu" && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        const items = [...element.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
        event.preventDefault();
        items[next]?.focus();
      } else if (event.key === "Tab") {
        closeRef.current();
        // Let the browser continue from the trigger in document tab order.
        anchor.focus();
      }
    };
    element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", keydown, true);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [anchorRef, role]);
  return createPortal(<div ref={ref} className={className} role={role} aria-label={label} style={{ ...position, position: "fixed", right: "auto", bottom: "auto", boxSizing: "border-box", minWidth: 0, overflow: "auto", zIndex: 100 }}>{children}</div>, document.fullscreenElement ?? document.body);
}
