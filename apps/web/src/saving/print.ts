/**
 * Prints the generated PDF in an ephemeral, hidden frame. Keeping the frame in
 * the current WebView avoids a persistent browser tab (and avoids Tauri asking
 * the OS to open an external browser). The frame and object URL are released
 * after the system dialog returns, including cancellation.
 */
export function printPdfBlob(pdfBlob: Blob): void {
  const printUrl = URL.createObjectURL(pdfBlob);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    URL.revokeObjectURL(printUrl);
    frame.remove();
  };
  const frame = document.createElement("iframe");
  frame.className = "pdf-print-frame";
  frame.title = "Document temporaire pour impression";
  frame.setAttribute("aria-hidden", "true");
  frame.addEventListener("load", () => {
    const frameWindow = frame.contentWindow;
    if (!frameWindow) {
      release();
      return;
    }
    frameWindow.addEventListener("afterprint", release, { once: true });
    frameWindow.addEventListener("beforeunload", release, { once: true });
    window.setTimeout(() => {
      frameWindow.focus();
      frameWindow.print();
    }, 0);
  }, { once: true });
  frame.src = printUrl;
  document.body.append(frame);
  window.setTimeout(release, 120_000);
}
