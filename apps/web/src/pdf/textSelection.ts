export type TextSelectionRegistration = {
  unregister: () => void;
};

type RegisteredTextLayer = {
  endOfContent: HTMLDivElement;
  onMouseDown: () => void;
};

const textLayers = new Map<HTMLDivElement, RegisteredTextLayer>();

let globalListenersInstalled = false;
let isPointerDown = false;
let isFirefoxSelection: boolean | undefined;
let previousRange: Range | null = null;

const resetTextLayer = (
  textLayer: HTMLDivElement,
  registration: RegisteredTextLayer,
) => {
  textLayer.append(registration.endOfContent);
  registration.endOfContent.style.width = "";
  registration.endOfContent.style.height = "";
  registration.endOfContent.style.userSelect = "";
  textLayer.classList.remove("selecting");
};

const resetAllTextLayers = () => {
  for (const [textLayer, registration] of textLayers) {
    resetTextLayer(textLayer, registration);
  }
  previousRange = null;
};

const rangeIntersectsLayer = (range: Range, textLayer: HTMLDivElement) => {
  try {
    return range.intersectsNode(textLayer);
  } catch {
    return false;
  }
};

const asElement = (node: Node | null): Element | null => {
  if (!node) {
    return null;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    return node as Element;
  }
  return node.parentElement;
};

const previousContentNode = (
  node: Node,
  textLayer: HTMLDivElement,
): Node | null => {
  let current: Node | null = node;

  while (
    current &&
    current !== textLayer &&
    current.previousSibling === null
  ) {
    current = current.parentNode;
  }

  if (!current || current === textLayer || !current.previousSibling) {
    return null;
  }

  current = current.previousSibling;
  while (current.lastChild) {
    current = current.lastChild;
  }

  return current;
};

const isStartBoundaryBeingModified = (range: Range) => {
  if (!previousRange) {
    return false;
  }

  try {
    return (
      range.compareBoundaryPoints(Range.END_TO_END, previousRange) === 0 ||
      range.compareBoundaryPoints(Range.START_TO_END, previousRange) === 0
    );
  } catch {
    return false;
  }
};

const rememberRange = (range: Range) => {
  try {
    previousRange = range.cloneRange();
  } catch {
    previousRange = null;
  }
};

const moveEndOfContent = (range: Range) => {
  const modifyStart = isStartBoundaryBeingModified(range);
  let anchor: Node | null = modifyStart
    ? range.startContainer
    : range.endContainer;
  let anchorElement = asElement(anchor);

  if (anchorElement?.classList.contains("highlight")) {
    anchorElement = anchorElement.parentElement;
    anchor = anchorElement;
  }

  const initialTextLayer =
    anchorElement?.closest<HTMLDivElement>(".textLayer") ?? null;

  if (
    !modifyStart &&
    range.endOffset === 0 &&
    initialTextLayer &&
    anchor
  ) {
    anchor = previousContentNode(anchorElement ?? anchor, initialTextLayer);
    anchorElement = asElement(anchor);
  }

  const parentTextLayer =
    anchorElement?.closest<HTMLDivElement>(".textLayer") ?? null;
  const registration = parentTextLayer
    ? textLayers.get(parentTextLayer)
    : undefined;

  if (
    !registration ||
    !anchorElement ||
    anchorElement === parentTextLayer ||
    anchorElement === registration.endOfContent ||
    !parentTextLayer?.contains(anchorElement)
  ) {
    rememberRange(range);
    return;
  }

  const insertionParent = anchorElement.parentElement;
  if (!insertionParent) {
    rememberRange(range);
    return;
  }

  const { endOfContent } = registration;
  endOfContent.style.width = parentTextLayer.style.width;
  endOfContent.style.height = parentTextLayer.style.height;
  endOfContent.style.userSelect = "text";
  insertionParent.insertBefore(
    endOfContent,
    modifyStart ? anchorElement : anchorElement.nextSibling,
  );
  rememberRange(range);
};

const handlePointerDown = () => {
  isPointerDown = true;
};

const handlePointerUp = () => {
  isPointerDown = false;
  resetAllTextLayers();
};

const handleWindowBlur = () => {
  isPointerDown = false;
  resetAllTextLayers();
};

const handleKeyUp = () => {
  if (!isPointerDown) {
    resetAllTextLayers();
  }
};

const handleSelectionChange = () => {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) {
    resetAllTextLayers();
    return;
  }

  const activeTextLayers = new Set<HTMLDivElement>();
  for (let rangeIndex = 0; rangeIndex < selection.rangeCount; rangeIndex += 1) {
    const range = selection.getRangeAt(rangeIndex);
    for (const textLayer of textLayers.keys()) {
      if (
        !activeTextLayers.has(textLayer) &&
        rangeIntersectsLayer(range, textLayer)
      ) {
        activeTextLayers.add(textLayer);
      }
    }
  }

  for (const [textLayer, registration] of textLayers) {
    if (activeTextLayers.has(textLayer)) {
      textLayer.classList.add("selecting");
    } else {
      resetTextLayer(textLayer, registration);
    }
  }

  const firstTextLayer = textLayers.keys().next().value;
  if (!firstTextLayer) {
    return;
  }

  isFirefoxSelection ??=
    getComputedStyle(firstTextLayer).getPropertyValue("-moz-user-select") ===
    "none";

  // Firefox represents cross-page selections with multiple ranges and already
  // keeps their endpoints local. Moving a sentinel there would collapse that
  // native multi-range behaviour.
  if (isFirefoxSelection) {
    return;
  }

  moveEndOfContent(selection.getRangeAt(0));
};

const installGlobalListeners = () => {
  if (globalListenersInstalled) {
    return;
  }

  document.addEventListener("pointerdown", handlePointerDown);
  document.addEventListener("pointerup", handlePointerUp);
  document.addEventListener("keyup", handleKeyUp);
  document.addEventListener("selectionchange", handleSelectionChange);
  window.addEventListener("blur", handleWindowBlur);
  globalListenersInstalled = true;
};

const removeGlobalListeners = () => {
  if (!globalListenersInstalled) {
    return;
  }

  document.removeEventListener("pointerdown", handlePointerDown);
  document.removeEventListener("pointerup", handlePointerUp);
  document.removeEventListener("keyup", handleKeyUp);
  document.removeEventListener("selectionchange", handleSelectionChange);
  window.removeEventListener("blur", handleWindowBlur);
  globalListenersInstalled = false;
  isPointerDown = false;
  isFirefoxSelection = undefined;
  previousRange = null;
};

const removeRegistration = (
  textLayer: HTMLDivElement,
  registration: RegisteredTextLayer,
) => {
  if (textLayers.get(textLayer) !== registration) {
    return;
  }

  textLayer.removeEventListener("mousedown", registration.onMouseDown);
  resetTextLayer(textLayer, registration);
  registration.endOfContent.remove();
  textLayers.delete(textLayer);

  if (textLayers.size === 0) {
    removeGlobalListeners();
  }
};

export const registerTextLayerSelection = (
  textLayer: HTMLDivElement,
): TextSelectionRegistration => {
  const previousRegistration = textLayers.get(textLayer);
  if (previousRegistration) {
    removeRegistration(textLayer, previousRegistration);
  }

  const endOfContent = document.createElement("div");
  endOfContent.className = "endOfContent";
  endOfContent.setAttribute("aria-hidden", "true");

  const registration: RegisteredTextLayer = {
    endOfContent,
    onMouseDown: () => {
      textLayer.classList.add("selecting");
    },
  };

  textLayer.append(endOfContent);
  textLayer.addEventListener("mousedown", registration.onMouseDown);
  textLayers.set(textLayer, registration);
  installGlobalListeners();

  let registered = true;
  return {
    unregister: () => {
      if (!registered) {
        return;
      }
      registered = false;
      removeRegistration(textLayer, registration);
    },
  };
};
