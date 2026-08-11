export function downloadPdfToBrowser(pdfBlob: Blob, fileName: string) {
  const downloadUrl = URL.createObjectURL(pdfBlob);
  const downloadLink = document.createElement("a");
  downloadLink.href = downloadUrl;
  downloadLink.download = fileName;
  document.body.append(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);

  return new File([pdfBlob], fileName, {
    type: pdfBlob.type || "application/pdf",
  });
}
