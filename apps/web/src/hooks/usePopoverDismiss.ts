import { useEffect, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";

export function usePopoverDismiss(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  surface: RefObject<HTMLElement | null>,
  setOpen: (open: boolean) => void,
) {
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent | FocusEvent) => {
      if (event.target instanceof Node &&
          !anchor.current?.contains(event.target) && !surface.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      anchor.current?.focus({ preventScroll: true });
    };
    window.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, anchor, surface, setOpen]);
}

export function moveMenuFocus(event: ReactKeyboardEvent<HTMLElement>) {
  const { key, currentTarget } = event;
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(key)) return;
  const buttons = [...currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
  if (!buttons.length) return;
  event.preventDefault();
  event.stopPropagation();
  const current = buttons.findIndex((button) => button === document.activeElement);
  const next = key === "Home" || (current < 0 && key === "ArrowDown") ? 0
    : key === "End" || current < 0 ? buttons.length - 1
    : (current + (key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
  buttons[next].focus();
}
