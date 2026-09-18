export type PrintPdfCallbacks = {
  onComplete?: () => void;
  onError?: () => void;
};

/**
 * Prints the generated PDF in an ephemeral, hidden frame. Keeping the frame in
 * the current WebView avoids a persistent browser tab (and avoids Tauri asking
 * the OS to open an external browser). The caller owns the visible preview and
 * can dispose this task when the user cancels it.
 */
export function printPdfBlob(pdfBlob: Blob, callbacks: PrintPdfCallbacks = {}): () => void {
  const printUrl = URL.createObjectURL(pdfBlob);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    URL.revokeObjectURL(printUrl);
    frame.remove();
    callbacks.onComplete?.();
  };
  const frame = document.createElement("iframe");
  frame.className = "pdf-print-frame";
  frame.title = "Document temporaire pour impression";
  frame.setAttribute("aria-hidden", "true");
  frame.addEventListener("load", () => {
    const frameWindow = frame.contentWindow;
    if (!frameWindow) {
      callbacks.onError?.();
      release();
      return;
    }
    frameWindow.addEventListener("afterprint", release, { once: true });
    frameWindow.addEventListener("beforeunload", release, { once: true });
    window.setTimeout(() => {
      try {
        frameWindow.focus();
        frameWindow.print();
      } catch {
        callbacks.onError?.();
        release();
      }
    }, 0);
  }, { once: true });
  frame.src = printUrl;
  document.body.append(frame);
  window.setTimeout(release, 120_000);
  return release;
}

/** Opens a printable PDF only after an explicit user fallback action. */
export function openPdfBlobForPrint(pdfBlob: Blob): boolean {
  const printUrl = URL.createObjectURL(pdfBlob);
  const printWindow = window.open(printUrl, "_blank", "noopener");
  if (!printWindow) {
    URL.revokeObjectURL(printUrl);
    return false;
  }
  // Give the new browsing context enough time to load the Blob before release.
  window.setTimeout(() => URL.revokeObjectURL(printUrl), 120_000);
  return true;
}
