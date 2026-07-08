import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

function resolveScrollPosition(target: HTMLElement, options: ScrollToOptions | number | undefined) {
  if (typeof options === "number") {
    return { left: target.scrollLeft, top: options };
  }

  return {
    left: options?.left ?? target.scrollLeft,
    top: options?.top ?? target.scrollTop,
  };
}

Object.defineProperty(HTMLElement.prototype, "scrollTo", {
  configurable: true,
  value: vi.fn(function scrollTo(this: HTMLElement, options?: ScrollToOptions | number) {
    const { left, top } = resolveScrollPosition(this, options);

    this.scrollLeft = left;
    this.scrollTop = top;
    this.dispatchEvent(new Event("scroll"));
  }),
});

Object.defineProperty(HTMLElement.prototype, "scrollBy", {
  configurable: true,
  value: vi.fn(function scrollBy(this: HTMLElement, options?: ScrollToOptions | number) {
    if (typeof options === "number") {
      this.scrollTop += options;
      return;
    }

    this.scrollLeft += options?.left ?? 0;
    this.scrollTop += options?.top ?? 0;
    this.dispatchEvent(new Event("scroll"));
  }),
});

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(function scrollIntoView(this: HTMLElement) {
    this.dispatchEvent(new Event("scroll"));
  }),
});

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: vi.fn(() => ({
    clearRect: vi.fn(),
    setTransform: vi.fn(),
  })),
});

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn((query: string) => ({
    matches: query.includes("prefers-color-scheme: dark") ? false : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
