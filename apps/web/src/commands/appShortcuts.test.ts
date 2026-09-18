import { describe, expect, it } from "vitest";
import {
  getAppCommandShortcutLabel,
  getShortcutPlatform,
  isEditableKeyboardTarget,
  isPrimaryModifier,
  resolveAppShortcut,
} from "./appShortcuts";

function shortcutEvent(key: string, overrides: Partial<KeyboardEvent> = {}) {
  return { key, code: "", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...overrides } as KeyboardEvent;
}

describe("app shortcuts", () => {
  it("uses one primary modifier per platform", () => {
    expect(getShortcutPlatform("MacIntel")).toBe("mac");
    expect(getShortcutPlatform("Win32")).toBe("other");
    expect(isPrimaryModifier(shortcutEvent("s", { metaKey: true }), "mac")).toBe(true);
    expect(isPrimaryModifier(shortcutEvent("s", { ctrlKey: true }), "mac")).toBe(false);
    expect(isPrimaryModifier(shortcutEvent("s", { ctrlKey: true }), "other")).toBe(true);
  });

  it("normalizes save, history and AZERTY/numpad zoom variants", () => {
    expect(resolveAppShortcut(shortcutEvent("s", { ctrlKey: true }), { desktop: true, platform: "other" })).toBe("file.save");
    expect(resolveAppShortcut(shortcutEvent("s", { ctrlKey: true, shiftKey: true }), { desktop: true, platform: "other" })).toBe("file.saveAs");
    expect(resolveAppShortcut(shortcutEvent("z", { metaKey: true, shiftKey: true }), { desktop: true, platform: "mac" })).toBe("history.redo");
    expect(resolveAppShortcut(shortcutEvent("=", { ctrlKey: true, shiftKey: true }), { desktop: true, platform: "other" })).toBe("view.zoomIn");
    expect(resolveAppShortcut(shortcutEvent("Unidentified", { ctrlKey: true, code: "NumpadSubtract" }), { desktop: true, platform: "other" })).toBe("view.zoomOut");
  });

  it("leaves browser-reserved document closing to the web browser", () => {
    expect(resolveAppShortcut(shortcutEvent("w", { ctrlKey: true }), { desktop: false, platform: "other" })).toBeNull();
    expect(resolveAppShortcut(shortcutEvent("w", { ctrlKey: true }), { desktop: true, platform: "other" })).toBe("file.close");
    expect(resolveAppShortcut(shortcutEvent("p", { ctrlKey: true }), { desktop: false, platform: "other" })).toBeNull();
    expect(resolveAppShortcut(shortcutEvent("p", { ctrlKey: true }), { desktop: true, platform: "other" })).toBe("print.document");
    expect(getAppCommandShortcutLabel("file.saveAs", "mac")).toBe("⌘⇧S");
    expect(resolveAppShortcut(shortcutEvent("Tab", { ctrlKey: true }), { desktop: true, platform: "mac" })).toBe("tabs.next");
    expect(resolveAppShortcut(shortcutEvent("Tab", { metaKey: true }), { desktop: true, platform: "mac" })).toBeNull();
  });

  it("recognizes text editing targets", () => {
    const input = document.createElement("input");
    input.type = "text";
    const textarea = document.createElement("textarea");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    expect(isEditableKeyboardTarget(input)).toBe(true);
    expect(isEditableKeyboardTarget(textarea)).toBe(true);
    expect(isEditableKeyboardTarget(editable)).toBe(true);
    expect(isEditableKeyboardTarget(document.createElement("button"))).toBe(false);
  });
});
