export type ShortcutPlatform = "mac" | "other";

export type AppCommandId =
  | "file.open"
  | "file.close"
  | "file.save"
  | "file.saveAs"
  | "print.document"
  | "history.undo"
  | "history.redo"
  | "edit.copy"
  | "edit.paste"
  | "view.zoomIn"
  | "view.zoomOut"
  | "view.resetZoom"
  | "tabs.next"
  | "tabs.previous"
  | "search.open"
  | "overlay.escape";

export type ShortcutEvent = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">;

/**
 * Declarative shortcut source of truth. App.tsx supplies the context-sensitive
 * executors, while buttons and tooltips can consume these platform labels.
 */
export const APP_COMMAND_SHORTCUTS: Record<AppCommandId, { mac: string; other: string }> = {
  "file.open": { mac: "⌘O", other: "Ctrl+O" },
  "file.close": { mac: "⌘W", other: "Ctrl+W" },
  "file.save": { mac: "⌘S", other: "Ctrl+S" },
  "file.saveAs": { mac: "⌘⇧S", other: "Ctrl+Shift+S" },
  "print.document": { mac: "⌘P", other: "Ctrl+P" },
  "history.undo": { mac: "⌘Z", other: "Ctrl+Z" },
  "history.redo": { mac: "⌘⇧Z", other: "Ctrl+Y / Ctrl+Shift+Z" },
  "edit.copy": { mac: "⌘C", other: "Ctrl+C" },
  "edit.paste": { mac: "⌘V", other: "Ctrl+V" },
  "view.zoomIn": { mac: "⌘+", other: "Ctrl++" },
  "view.zoomOut": { mac: "⌘−", other: "Ctrl+−" },
  "view.resetZoom": { mac: "⌘0", other: "Ctrl+0" },
  "tabs.next": { mac: "⌃Tab", other: "Ctrl+Tab" },
  "tabs.previous": { mac: "⌃⇧Tab", other: "Ctrl+Shift+Tab" },
  "search.open": { mac: "⌘F", other: "Ctrl+F" },
  "overlay.escape": { mac: "Esc", other: "Esc" },
};

export function getShortcutPlatform(platform = typeof navigator === "undefined" ? "" : navigator.platform): ShortcutPlatform {
  return /mac|iphone|ipad|ipod/i.test(platform) ? "mac" : "other";
}

export function isPrimaryModifier(event: Pick<KeyboardEvent, "ctrlKey" | "metaKey">, platform = getShortcutPlatform()): boolean {
  // Accept Meta as well on non-macOS: it keeps remote/macOS keyboards usable
  // through a browser running on another host, while Ctrl remains canonical.
  return platform === "mac" ? event.metaKey : event.ctrlKey || event.metaKey;
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.getAttribute("contenteditable") === "true") return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return ["file", "text", "search", "email", "url", "tel", "password", "number"].includes(target.type);
}

export function getAppCommandShortcutLabel(commandId: AppCommandId, platform = getShortcutPlatform()): string {
  return APP_COMMAND_SHORTCUTS[commandId][platform];
}

export function resolveAppShortcut(
  event: ShortcutEvent,
  { desktop, platform = getShortcutPlatform() }: { desktop: boolean; platform?: ShortcutPlatform },
): AppCommandId | null {
  if (event.altKey) return null;
  if (event.key === "Escape") return "overlay.escape";
  // Cmd+Tab belongs to the operating system on macOS. Ctrl+Tab remains
  // application-local and is the label exposed by the command registry.
  if (event.key.toLowerCase() === "tab" && desktop && event.ctrlKey && !event.metaKey) {
    return event.shiftKey ? "tabs.previous" : "tabs.next";
  }
  if (!isPrimaryModifier(event, platform)) return null;

  const key = event.key.toLowerCase();
  if (key === "o") return "file.open";
  if (key === "w") return desktop ? "file.close" : null;
  if (key === "s") return event.shiftKey ? "file.saveAs" : "file.save";
  if (key === "p") return desktop ? "print.document" : null;
  if (key === "z") return event.shiftKey ? "history.redo" : "history.undo";
  if (key === "y") return "history.redo";
  if (key === "c") return "edit.copy";
  if (key === "v") return "edit.paste";
  if (key === "f") return "search.open";
  if (key === "+" || key === "=" || event.code === "NumpadAdd") return "view.zoomIn";
  if (key === "-" || event.code === "NumpadSubtract") return "view.zoomOut";
  if (key === "0" || event.code === "Numpad0") return "view.resetZoom";
  return null;
}
