/**
 * Returns a scroll position that keeps an annotation in the useful centre of
 * the PDF viewport. All values are CSS pixels local to the scroll container.
 */
export function getAnnotationScrollTop({
  annotationTop,
  annotationHeight,
  viewportHeight,
  scrollHeight,
}: {
  annotationTop: number;
  annotationHeight: number;
  viewportHeight: number;
  scrollHeight: number;
}) {
  const maximumScrollTop = Math.max(0, scrollHeight - viewportHeight);
  const desiredScrollTop = annotationTop - viewportHeight / 2 + annotationHeight / 2;

  return Math.min(maximumScrollTop, Math.max(0, desiredScrollTop));
}
