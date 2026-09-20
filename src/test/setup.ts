import '@testing-library/jest-dom/vitest';

// jsdom implements <dialog> but not showModal/close, which the Sheet uses.
// The real behavior (focus trap, inertness, Esc) is the browser's; here we
// only need the element to open and close so the content renders.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement, returnValue?: string) {
    this.open = false;
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.dispatchEvent(new Event('close'));
  };
}

// jsdom has no matchMedia; the Select asks it whether to anchor the list to
// the trigger (wide screens) or show it as a bottom sheet (narrow ones).
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: !query.includes('max-width'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
