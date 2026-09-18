export function openPrintWindow(): Window | null {
  const printWindow = window.open("", "_blank");
  if (printWindow) printWindow.opener = null;
  return printWindow;
}

/** Opens a generated PDF in the user-initiated window and releases its URL. */
export function printPdfBlob(printWindow: Window, pdfBlob: Blob): void {
  const printUrl = URL.createObjectURL(pdfBlob);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    URL.revokeObjectURL(printUrl);
  };
  printWindow.addEventListener("afterprint", release, { once: true });
  printWindow.addEventListener("beforeunload", release, { once: true });
  printWindow.location.replace(printUrl);
  window.setTimeout(() => {
    if (!printWindow.closed) {
      printWindow.focus();
      printWindow.print();
    }
  }, 350);
  window.setTimeout(release, 120_000);
}
