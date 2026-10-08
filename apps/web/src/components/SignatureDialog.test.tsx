import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignatureDialog } from "./SignatureDialog";
import { MAX_IMAGE_BYTES } from "../images/imagePolicy";

function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([137,80,78,71,13,10,26,10]); bytes.set([73,72,68,82],12);
  new DataView(bytes.buffer).setUint32(16,width); new DataView(bytes.buffer).setUint32(20,height);
  return bytes;
}

describe("SignatureDialog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("draws on a transparent canvas, clears it and confirms a PNG", () => {
    const context = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      closePath: vi.fn(),
      clearRect: vi.fn(),
      lineCap: "butt",
      lineJoin: "miter",
      lineWidth: 1,
      strokeStyle: "#000000",
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,c2lnbmF0dXJl",
    );
    const confirm = vi.fn();

    render(<SignatureDialog onCancel={vi.fn()} onConfirm={confirm} />);
    const canvas = screen.getByLabelText("Zone de dessin de la signature");
    const submit = screen.getByRole("button", { name: "Valider la signature" });
    expect(submit).toBeDisabled();

    fireEvent.pointerDown(canvas, {
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
      clientX: 20,
      clientY: 20,
    });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 120, clientY: 60 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    expect(context.stroke).toHaveBeenCalled();
    expect(submit).toBeEnabled();

    fireEvent.click(
      screen.getByRole("button", { name: "Effacer et recommencer" }),
    );
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 900, 300);
    expect(submit).toBeDisabled();

    fireEvent.pointerDown(canvas, {
      button: 0,
      pointerId: 2,
      pointerType: "mouse",
    });
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 50, clientY: 30 });
    fireEvent.pointerUp(canvas, { pointerId: 2 });
    fireEvent.click(submit);

    expect(confirm).toHaveBeenCalledWith({
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,c2lnbmF0dXJl",
      width: 900,
      height: 300,
    });
  });

  it("imports a local PNG while retaining its data URL and dimensions", async () => {
    class ImageMock {
      naturalWidth = 420;
      naturalHeight = 140;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", ImageMock);
    const confirm = vi.fn();
    render(<SignatureDialog onCancel={vi.fn()} onConfirm={confirm} />);

    fireEvent.click(screen.getByRole("tab", { name: "Importer" }));
    const file = new File([pngHeader(420,140)], "signature.png", {
      type: "image/png",
    });
    fireEvent.change(screen.getByLabelText("Importer une image de signature"), {
      target: { files: [file] },
    });

    await screen.findByAltText("Aperçu de la signature importée");
    fireEvent.click(screen.getByRole("button", { name: "Valider la signature" }));

    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(confirm.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        mimeType: "image/png",
        width: 420,
        height: 140,
        dataUrl: expect.stringMatching(/^data:image\/png;base64,/),
      }),
    );
  });

  it("accepts JPEG and rejects unsupported or oversized files", async () => {
    class ImageMock {
      naturalWidth = 300;
      naturalHeight = 100;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", ImageMock);
    const confirm = vi.fn();
    render(<SignatureDialog onCancel={vi.fn()} onConfirm={confirm} />);
    fireEvent.click(screen.getByRole("tab", { name: "Importer" }));
    const picker = screen.getByLabelText("Importer une image de signature");

    fireEvent.change(picker, {
      target: { files: [new File(["svg"], "signature.svg", { type: "image/svg+xml" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("PNG ou JPEG");

    fireEvent.change(picker, {
      target: {
        files: [new File(["svg"], "signature.png", { type: "image/svg+xml" })],
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("PNG ou JPEG");

    fireEvent.change(picker, {
      target: {
        files: [
          new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "large.png", {
            type: "image/png",
          }),
        ],
      },
    });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("32 Mio"));

    fireEvent.change(picker, {
      target: { files: [new File([new Uint8Array([255,216,255,192,0,7,8,0,100,1,44])], "signature.jpg", { type: "image/jpeg" })] },
    });
    await screen.findByAltText("Aperçu de la signature importée");
    fireEvent.click(screen.getByRole("button", { name: "Valider la signature" }));
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "image/jpeg", width: 300, height: 100 }),
    );
  });
});
