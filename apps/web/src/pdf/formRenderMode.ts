/**
 * Interactive AcroForm widgets are owned by PdfFormLayer. PDF.js must keep
 * their appearances out of the canvas while that layer is active.
 */
export function getDisplayAnnotationMode(
  hasInteractiveFormLayer: boolean,
  modes: { ENABLE: number; ENABLE_FORMS: number },
): number {
  return hasInteractiveFormLayer ? modes.ENABLE_FORMS : modes.ENABLE;
}
