import { useSyncExternalStore } from 'react';

// The width below which the app uses its phone layout: the tab bar, bottom
// sheets, and lists in place of tables. Kept equal to the stylesheet's.
export const PHONE = '(max-width: 767px)';

// A phone held in the hand: a narrow screen worked by touch. Here a picker
// fills the screen instead of hanging a small list under its field.
export const PICKER_SHEET = '(max-width: 767px) and (pointer: coarse)';

// Whether a media query matches now, following it as the window changes.
// For the few places where a phone gets different markup rather than
// different styling, such as a list where a wide screen has a table.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
