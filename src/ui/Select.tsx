import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export type SelectOption = { value: string; label: string; hint?: string };

// A picker that matches the app, because a native <select> draws its list with
// the operating system and cannot be styled. The field itself is the search:
// click it, or start typing, and the list opens under it, narrowing as you
// type, with what is chosen now shown faintly until you do. There is no
// second search box.
//
// It is a combobox in the ARIA sense: the field has role="combobox", the list
// is a listbox it controls, the highlighted option is its active descendant,
// and arrow keys, Enter and Esc all work. The list is a popover, so it sits in
// the top layer above any sheet it opens from without making the field inert.
export function Select({
  id,
  value,
  options,
  onChange,
  placeholder = 'Choose',
  label,
  disabled,
  emptyText = 'Nothing to choose yet.',
  className,
}: {
  id?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
  disabled?: boolean;
  emptyText?: string;
  // Extra classes for the field, where it has to sit in a different place.
  className?: string;
}) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();

  const selected = options.find((option) => option.value === value);
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return options;
    return options.filter((option) => option.label.toLowerCase().includes(term));
  }, [options, search]);

  // Clamped at render, so a narrowing search can never leave the highlight
  // pointing past the end of the list.
  const activeIndex = Math.min(active, Math.max(0, shown.length - 1));
  const optionId = (option: SelectOption) => `${listId}-${option.value}`;

  const openList = (typed = '') => {
    if (disabled) return;
    // Typing starts at the first match; a click starts at the current choice.
    const current = options.findIndex((option) => option.value === value);
    setSearch(typed);
    setActive(typed || current < 0 ? 0 : current);
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setSearch('');
  };

  const choose = (next: string) => {
    onChange(next);
    close();
  };

  // Place the list under the field, or above it when there is more room
  // there, within the part of the page actually on screen.
  //
  // On a phone that part is not the window. When the keyboard comes up,
  // Safari shrinks the visible area and also pans it down the page, so it
  // starts partway down rather than at the top (visualViewport.offsetTop).
  // The field's position and the list's are both measured from the top of
  // the page, so the visible band is offsetTop to offsetTop + height. The
  // list is always placed by its top edge, from its measured height, because
  // Safari's idea of the window's bottom moves with the keyboard.
  //
  // It is placed again whenever anything scrolls or resizes, whenever the
  // list itself changes height as the search narrows it, and on every frame
  // for the first moments, while the keyboard slides in and Safari scrolls
  // the field into view, since those don't always send an event.
  useLayoutEffect(() => {
    if (!open) return;
    const popup = popupRef.current;
    const field = fieldRef.current;
    if (!popup || !field) return;
    try {
      popup.showPopover?.();
    } catch {
      // Already showing, or popovers unsupported: it is placed either way.
    }
    const place = () => {
      const rect = field.getBoundingClientRect();
      const view = window.visualViewport;
      const viewTop = view?.offsetTop ?? 0;
      const viewLeft = view?.offsetLeft ?? 0;
      const viewHeight = view?.height ?? window.innerHeight;
      const viewWidth = view?.width ?? window.innerWidth;
      const width = Math.min(viewWidth - 16, Math.max(rect.width, 240));
      const left = Math.min(Math.max(viewLeft + 8, rect.right - width), viewLeft + viewWidth - width - 8);
      const below = viewTop + viewHeight - rect.bottom - 8;
      const above = rect.top - viewTop - 8;
      const up = below < 240 && above > below;
      popup.style.width = `${width}px`;
      popup.style.left = `${left}px`;
      popup.style.right = 'auto';
      popup.style.bottom = 'auto';
      popup.style.maxHeight = `${Math.max(120, Math.min(320, (up ? above : below) - 6))}px`;
      const height = popup.getBoundingClientRect().height;
      popup.style.top = `${up ? rect.top - 6 - height : rect.bottom + 6}px`;
    };
    place();

    let frame = 0;
    const settleUntil = performance.now() + 800;
    const settle = () => {
      place();
      if (performance.now() < settleUntil) frame = requestAnimationFrame(settle);
    };
    frame = requestAnimationFrame(settle);

    const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    resized?.observe(popup);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      cancelAnimationFrame(frame);
      resized?.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [open]);

  // Keep the highlighted option in view as the arrow keys move it.
  useLayoutEffect(() => {
    if (!open) return;
    const option = shown[activeIndex];
    if (option) document.getElementById(optionId(option))?.scrollIntoView?.({ block: 'nearest' });
    // optionId only joins listId and the value, both covered here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex, shown]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter') {
        event.preventDefault();
        openList();
      } else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        // The first letter typed replaces the choice shown and starts the search.
        event.preventDefault();
        openList(event.key);
      }
      return;
    }
    if (event.key === 'Escape') {
      // Closes the list only, never the sheet it opened from.
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = shown[activeIndex];
      if (option) choose(option.value);
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && shown.length > 0) {
      event.preventDefault();
      const next = event.key === 'ArrowDown' ? activeIndex + 1 : activeIndex - 1;
      setActive((next + shown.length) % shown.length);
    } else if (event.key === 'Tab') {
      close();
    }
  };

  // The width the field takes: the text it shows, so a picker in a filter
  // bar or a table cell is no wider than its words, as a button would be.
  const sizerText = open ? search || selected?.label || placeholder : (selected?.label ?? placeholder);

  return (
    <div
      ref={fieldRef}
      className={`select-trigger select-combo${className ? ` ${className}` : ''}`}
      data-open={open || undefined}
      // A press anywhere on the field, the chevron included, works the input.
      onMouseDown={(event) => {
        if (disabled || event.target === inputRef.current) return;
        event.preventDefault();
        inputRef.current?.focus();
        if (open) close();
        else openList();
      }}
    >
      <span className="select-field">
        <span className="select-sizer" aria-hidden="true">
          {sizerText}
        </span>
        <input
          ref={inputRef}
          id={id}
          className="select-input"
          type="text"
          // No built-in width of its own: the hidden copy of its words sizes it.
          size={1}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && shown[activeIndex] ? optionId(shown[activeIndex]) : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          value={open ? search : (selected?.label ?? '')}
          placeholder={open ? (selected?.label ?? placeholder) : placeholder}
          onChange={(event) => {
            if (!open) setOpen(true);
            setSearch(event.target.value);
            setActive(0);
          }}
          onClick={() => {
            if (!open) openList();
          }}
          onBlur={close}
          onKeyDown={onKeyDown}
        />
      </span>
      <ChevronDown strokeWidth={1.75} aria-hidden />

      {open && (
        <div
          ref={popupRef}
          className="combo-popup"
          popover="manual"
          // Keeps the field focused while the list is pressed or scrolled, and
          // keeps the press from reaching the field, which would close it.
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <ul id={listId} className="select-list" role="listbox" aria-label={label}>
            {shown.map((option, index) => (
              <li
                key={option.value}
                id={optionId(option)}
                role="option"
                // Without this the hint would be read as part of the name.
                aria-label={option.hint ? option.label : undefined}
                aria-selected={option.value === value}
                className={index === activeIndex ? 'active' : undefined}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option.value)}
              >
                <span className="select-label">
                  {option.label}
                  {option.hint && <small>{option.hint}</small>}
                </span>
                {option.value === value && <Check strokeWidth={2} aria-hidden />}
              </li>
            ))}
            {shown.length === 0 && (
              <li className="select-empty">{search.trim() ? `Nothing matches “${search.trim()}”.` : emptyText}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
