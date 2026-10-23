// Light or dark is a per-device convenience, like the sidebar, so it lives in
// localStorage, which can be missing or refuse (a private window). Automatic
// leaves it to the device: brand/tokens.css follows prefers-color-scheme
// unless <html data-theme> says otherwise.
export type ThemeChoice = 'auto' | 'light' | 'dark';

const THEME_KEY = 'lodestar.theme';

export function readTheme(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveTheme(choice: ThemeChoice) {
  try {
    if (choice === 'auto') window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Nothing to do: the choice just won't outlive the tab.
  }
  applyTheme(choice);
}

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'auto') {
    delete root.dataset.theme;
    root.style.removeProperty('color-scheme');
  } else {
    root.dataset.theme = choice;
    // Native parts (scrollbars, the date field's own controls) follow too.
    root.style.setProperty('color-scheme', choice);
  }
  // The browser's own bar matches the page. Each tag keeps its first content
  // so Automatic can hand it back; a chosen theme takes the ground token.
  const ground = getComputedStyle(root).getPropertyValue('--ground').trim();
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const original = (meta.dataset.original ??= meta.content);
    meta.content = choice === 'auto' || !ground ? original : ground;
  });
}
