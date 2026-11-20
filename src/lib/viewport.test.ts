import { isAppleTouch, viewportWithoutAutoZoom } from './viewport';

describe('steady viewport', () => {
  it('knows an iPhone, and an iPad that calls itself a Mac', () => {
    expect(isAppleTouch('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe(true);
    expect(isAppleTouch('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
  });

  it('leaves a Mac, Android and Windows alone, so pinching still works there', () => {
    expect(isAppleTouch('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(isAppleTouch('Mozilla/5.0 (Linux; Android 14; Pixel 7)', 5)).toBe(false);
    expect(isAppleTouch('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 0)).toBe(false);
  });

  it('adds the limit once', () => {
    const once = viewportWithoutAutoZoom('width=device-width, initial-scale=1, viewport-fit=cover');
    expect(once).toBe('width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1');
    expect(viewportWithoutAutoZoom(once)).toBe(once);
  });
});
