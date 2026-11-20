// iPhone and iPad only: keep Safari from zooming the page by itself.
//
// Safari zooms in on a field when it is tapped if it judges the text too
// small, and doesn't always zoom back out, so the page is left enlarged. Every
// field is already 16px on a phone, yet it still happens. Telling Safari the
// page's largest scale is 1 stops those automatic zooms. On iOS this does not
// stop anyone from pinching to zoom: Safari has ignored that limit for
// pinching since iOS 10. Other browsers, where it would block pinching, never
// get it.
export function isAppleTouch(userAgent: string, maxTouchPoints: number): boolean {
  // iPadOS reports itself as a Mac; a Mac has no touch screen.
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export function viewportWithoutAutoZoom(content: string): string {
  if (/maximum-scale/.test(content)) return content;
  return `${content}, maximum-scale=1`;
}

export function steadyViewport(): void {
  if (!isAppleTouch(navigator.userAgent, navigator.maxTouchPoints ?? 0)) return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (meta) meta.content = viewportWithoutAutoZoom(meta.content);
}
