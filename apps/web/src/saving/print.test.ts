import { describe, expect, it, vi } from "vitest";
import { openPdfBlobForPrint, printPdfBlob } from "./print";

describe("print workflow", () => {
  it("uses an ephemeral iframe and revokes the temporary URL after printing", () => {
    vi.useFakeTimers();
    const print = vi.fn();
    const focus = vi.fn();
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:current-document");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const frameWindow = { print, focus, addEventListener: vi.fn() } as unknown as Window;

    printPdfBlob(new Blob(["pdf"], { type: "application/pdf" }));
    const frame = document.querySelector("iframe.pdf-print-frame") as HTMLIFrameElement;
    expect(frame).not.toBeNull();
    Object.defineProperty(frame, "contentWindow", { value: frameWindow });
    frame.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(0);
    expect(focus).toHaveBeenCalledOnce();
    expect(print).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(120_000);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:current-document");

    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
    vi.useRealTimers();
  });

  it("only opens a tab when the user explicitly requests the fallback", () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:print-fallback");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);

    expect(openPdfBlobForPrint(new Blob(["pdf"]))).toBe(true);
    expect(open).toHaveBeenCalledWith("blob:print-fallback", "_blank", "noopener");

    open.mockRestore();
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
  });
});
