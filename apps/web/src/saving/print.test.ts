import { describe, expect, it, vi } from "vitest";
import { openPrintWindow, printPdfBlob } from "./print";

describe("print workflow", () => {
  it("opens the window synchronously and revokes the temporary URL after printing", () => {
    vi.useFakeTimers();
    const replace = vi.fn();
    const print = vi.fn();
    const focus = vi.fn();
    const addEventListener = vi.fn();
    const popup = {
      opener: {} as Window | null,
      closed: false,
      location: { replace },
      print,
      focus,
      addEventListener,
    } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(popup);
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:current-document");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    expect(openPrintWindow()).toBe(popup);
    expect(popup.opener).toBeNull();
    printPdfBlob(popup, new Blob(["pdf"], { type: "application/pdf" }));
    expect(replace).toHaveBeenCalledWith("blob:current-document");
    vi.advanceTimersByTime(350);
    expect(focus).toHaveBeenCalledOnce();
    expect(print).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(120_000);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:current-document");

    open.mockRestore();
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
    vi.useRealTimers();
  });
});
