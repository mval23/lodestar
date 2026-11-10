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

// jsdom hides [popover] elements but cannot show them. The Select's list is
// one; here showing it only has to make it render, as the browser would.
if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.showPopover) {
  HTMLElement.prototype.showPopover = function showPopover(this: HTMLElement) {
    this.style.display = 'flex';
  };
  HTMLElement.prototype.hidePopover = function hidePopover(this: HTMLElement) {
    this.style.display = '';
  };
}

// jsdom has no matchMedia; the date picker asks it whether to anchor its
// calendar to the field (wide screens) or show it as a bottom sheet.
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
