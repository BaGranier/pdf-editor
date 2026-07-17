import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerTextLayerSelection,
  type TextSelectionRegistration,
} from "./textSelection";

const registrations: TextSelectionRegistration[] = [];
const mountedLayers: HTMLDivElement[] = [];

const createTextLayer = (...fragments: string[]) => {
  const textLayer = document.createElement("div");
  textLayer.className = "textLayer pdf-text-layer";
  textLayer.style.width = "600px";
  textLayer.style.height = "800px";

  for (const fragment of fragments) {
    const span = document.createElement("span");
    span.textContent = fragment;
    textLayer.append(span);
  }

  document.body.append(textLayer);
  mountedLayers.push(textLayer);
  const registration = registerTextLayerSelection(textLayer);
  registrations.push(registration);

  return {
    textLayer,
    spans: Array.from(textLayer.querySelectorAll("span")),
    endOfContent: textLayer.querySelector<HTMLDivElement>(".endOfContent")!,
    registration,
  };
};

const createRange = (
  startNode: Node,
  startOffset: number,
  endNode = startNode,
  endOffset = startOffset,
) => {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
};

const mockSelection = (ranges: Range[]) => {
  vi.spyOn(document, "getSelection").mockReturnValue({
    rangeCount: ranges.length,
    getRangeAt: (index: number) => ranges[index],
  } as Selection);
};

const dispatchSelectionChange = () => {
  document.dispatchEvent(new Event("selectionchange"));
};

afterEach(() => {
  for (const registration of registrations.splice(0).reverse()) {
    registration.unregister();
  }
  for (const textLayer of mountedLayers.splice(0)) {
    textLayer.remove();
  }
  vi.restoreAllMocks();
});

describe("registerTextLayerSelection", () => {
  it("appends an inert end-of-content sentinel after the text fragments", () => {
    const { textLayer, spans, endOfContent } = createTextLayer(
      "Premier",
      "Second",
    );

    expect(endOfContent).toHaveClass("endOfContent");
    expect(endOfContent).toHaveAttribute("aria-hidden", "true");
    expect(textLayer.lastElementChild).toBe(endOfContent);
    expect(endOfContent.previousElementSibling).toBe(spans[1]);
  });

  it("removes the sentinel and local state when unregistered", () => {
    const { textLayer, endOfContent, registration } =
      createTextLayer("Texte");
    textLayer.classList.add("selecting");

    registration.unregister();

    expect(endOfContent).not.toBeInTheDocument();
    expect(textLayer).not.toHaveClass("selecting");
  });

  it("starts selection on mousedown without preventing the native event", () => {
    const { textLayer, spans } = createTextLayer("Texte");
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });

    spans[0]?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(textLayer).toHaveClass("selecting");
  });

  it("moves the sentinel after the modified end fragment", () => {
    const { textLayer, spans, endOfContent } = createTextLayer(
      "Un",
      "Deux",
      "Trois",
    );
    const endText = spans[1]?.firstChild;
    expect(endText).not.toBeNull();
    mockSelection([createRange(endText!, 0, endText!, 4)]);

    dispatchSelectionChange();

    expect(textLayer).toHaveClass("selecting");
    expect(spans[1]?.nextElementSibling).toBe(endOfContent);
    expect(endOfContent.nextElementSibling).toBe(spans[2]);
    expect(endOfContent.style.width).toBe("600px");
    expect(endOfContent.style.height).toBe("800px");
    expect(endOfContent.style.userSelect).toBe("text");
  });

  it("moves the sentinel before the start fragment when that boundary changes", () => {
    const { spans, endOfContent } = createTextLayer(
      "Un",
      "Deux",
      "Trois",
    );
    const firstText = spans[0]?.firstChild;
    const secondText = spans[1]?.firstChild;
    const thirdText = spans[2]?.firstChild;
    expect(firstText && secondText && thirdText).toBeTruthy();

    mockSelection([createRange(secondText!, 0, thirdText!, 5)]);
    dispatchSelectionChange();

    vi.mocked(document.getSelection).mockReturnValue({
      rangeCount: 1,
      getRangeAt: () => createRange(firstText!, 0, thirdText!, 5),
    } as unknown as Selection);
    dispatchSelectionChange();

    expect(spans[0]?.previousElementSibling).toBe(endOfContent);
    expect(endOfContent.nextElementSibling).toBe(spans[0]);
  });

  it("resolves a text-node endpoint and an endOffset at a fragment boundary", () => {
    const { spans, endOfContent } = createTextLayer(
      "Un",
      "Deux",
      "Trois",
    );
    const thirdText = spans[2]?.firstChild;
    expect(thirdText).not.toBeNull();
    mockSelection([createRange(thirdText!, 0, thirdText!, 0)]);

    dispatchSelectionChange();

    expect(spans[1]?.nextElementSibling).toBe(endOfContent);
    expect(endOfContent.nextElementSibling).toBe(spans[2]);
  });

  it("activates every layer intersected by Firefox-style multiple ranges", () => {
    const getComputedStyle = vi
      .spyOn(window, "getComputedStyle")
      .mockReturnValue({
        getPropertyValue: (property: string) =>
          property === "-moz-user-select" ? "none" : "",
      } as CSSStyleDeclaration);
    const first = createTextLayer("Page une");
    const second = createTextLayer("Page deux");
    const firstText = first.spans[0]?.firstChild;
    const secondText = second.spans[0]?.firstChild;
    expect(firstText && secondText).toBeTruthy();
    mockSelection([
      createRange(firstText!, 0, firstText!, 4),
      createRange(secondText!, 0, secondText!, 4),
    ]);

    dispatchSelectionChange();

    expect(first.textLayer).toHaveClass("selecting");
    expect(second.textLayer).toHaveClass("selecting");
    expect(first.textLayer.lastElementChild).toBe(first.endOfContent);
    expect(second.textLayer.lastElementChild).toBe(second.endOfContent);
    expect(getComputedStyle).toHaveBeenCalled();
  });

  it("resets layers that are not part of the current selection", () => {
    const active = createTextLayer("Page active");
    const inactive = createTextLayer("Autre page");
    inactive.textLayer.classList.add("selecting");
    inactive.endOfContent.style.width = "600px";
    const activeText = active.spans[0]?.firstChild;
    expect(activeText).not.toBeNull();
    mockSelection([createRange(activeText!, 0, activeText!, 4)]);

    dispatchSelectionChange();

    expect(active.textLayer).toHaveClass("selecting");
    expect(inactive.textLayer).not.toHaveClass("selecting");
    expect(inactive.textLayer.lastElementChild).toBe(inactive.endOfContent);
    expect(inactive.endOfContent.style.width).toBe("");
  });

  it("resets safely for an empty or external selection", () => {
    const { textLayer, endOfContent } = createTextLayer("PDF");
    const outside = document.createElement("p");
    outside.textContent = "Hors PDF";
    document.body.append(outside);
    textLayer.classList.add("selecting");
    mockSelection([]);

    expect(dispatchSelectionChange).not.toThrow();
    expect(textLayer).not.toHaveClass("selecting");

    const outsideText = outside.firstChild;
    expect(outsideText).not.toBeNull();
    vi.mocked(document.getSelection).mockReturnValue({
      rangeCount: 1,
      getRangeAt: () => createRange(outsideText!, 0, outsideText!, 3),
    } as unknown as Selection);
    textLayer.classList.add("selecting");

    expect(dispatchSelectionChange).not.toThrow();
    expect(textLayer).not.toHaveClass("selecting");
    expect(textLayer.lastElementChild).toBe(endOfContent);
    outside.remove();
  });

  it("resets selection state on pointerup, blur, and keyup", () => {
    const { textLayer, spans, endOfContent } = createTextLayer(
      "Un",
      "Deux",
    );
    const endText = spans[0]?.firstChild;
    expect(endText).not.toBeNull();
    mockSelection([createRange(endText!, 0, endText!, 2)]);

    dispatchSelectionChange();
    document.dispatchEvent(new Event("pointerup"));
    expect(textLayer).not.toHaveClass("selecting");
    expect(textLayer.lastElementChild).toBe(endOfContent);

    fireMouseDown(spans[0]);
    window.dispatchEvent(new Event("blur"));
    expect(textLayer).not.toHaveClass("selecting");

    fireMouseDown(spans[0]);
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
    expect(textLayer).not.toHaveClass("selecting");

    document.dispatchEvent(new Event("pointerdown"));
    fireMouseDown(spans[0]);
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
    expect(textLayer).toHaveClass("selecting");
    document.dispatchEvent(new Event("pointerup"));
    expect(textLayer).not.toHaveClass("selecting");
  });

  it("installs one global listener set and removes it with the last layer", () => {
    const addDocumentListener = vi.spyOn(document, "addEventListener");
    const removeDocumentListener = vi.spyOn(document, "removeEventListener");
    const addWindowListener = vi.spyOn(window, "addEventListener");
    const removeWindowListener = vi.spyOn(window, "removeEventListener");
    const first = createTextLayer("Page une");
    const second = createTextLayer("Page deux");

    for (const eventName of [
      "pointerdown",
      "pointerup",
      "keyup",
      "selectionchange",
    ]) {
      expect(
        addDocumentListener.mock.calls.filter(
          ([registeredName]) => registeredName === eventName,
        ),
      ).toHaveLength(1);
    }
    expect(
      addWindowListener.mock.calls.filter(
        ([registeredName]) => registeredName === "blur",
      ),
    ).toHaveLength(1);

    first.registration.unregister();
    expect(
      removeDocumentListener.mock.calls.filter(
        ([registeredName]) => registeredName === "selectionchange",
      ),
    ).toHaveLength(0);

    second.registration.unregister();
    for (const eventName of [
      "pointerdown",
      "pointerup",
      "keyup",
      "selectionchange",
    ]) {
      expect(
        removeDocumentListener.mock.calls.filter(
          ([registeredName]) => registeredName === eventName,
        ),
      ).toHaveLength(1);
    }
    expect(
      removeWindowListener.mock.calls.filter(
        ([registeredName]) => registeredName === "blur",
      ),
    ).toHaveLength(1);
  });
});

const fireMouseDown = (target: Element | undefined) => {
  target?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
};
