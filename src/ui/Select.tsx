import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export type SelectOption = { value: string; label: string; hint?: string };

// A picker that matches the app, because a native <select> draws its list with
// the operating system and cannot be styled. The list lives in a <dialog>, so
// focus trapping, Esc and inertness come from the browser, and nothing has to
// inject a stylesheet.
//
// It stays keyboard- and screen-reader-navigable: the trigger is a button
// with aria-haspopup, the list is a listbox with aria-activedescendant, and
// arrow keys, Home/End, Enter and Esc all work.
export function Select({
  id,
  value,
  options,
  onChange,
  placeholder = 'Choose',
  label,
  disabled,
  emptyText = 'Nothing to choose yet.',
  searchThreshold = 12,
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
  searchThreshold?: number;
  // Extra classes for the trigger, where it has to sit in a different place.
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
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

  const close = () => {
    setOpen(false);
    setSearch('');
    triggerRef.current?.focus();
  };

  const choose = (next: string) => {
    onChange(next);
    close();
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Anchor the list under the trigger on a wide screen; the stylesheet
      // turns it into a bottom sheet on a narrow one.
      const trigger = triggerRef.current?.getBoundingClientRect();
      if (trigger && window.matchMedia?.('(min-width: 561px)').matches) {
        const width = Math.max(trigger.width, 240);
        const left = Math.min(Math.max(8, trigger.right - width), window.innerWidth - width - 8);
        const below = window.innerHeight - trigger.bottom;
        dialog.style.width = `${width}px`;
        dialog.style.left = `${left}px`;
        dialog.style.margin = '0';
        if (below < 240 && trigger.top > below) {
          dialog.style.top = 'auto';
          dialog.style.bottom = `${window.innerHeight - trigger.top + 6}px`;
        } else {
          dialog.style.top = `${trigger.bottom + 6}px`;
          dialog.style.bottom = 'auto';
        }
      }
      listRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Clamped at render, so a narrowing search can never leave the highlight
  // pointing past the end of the list.
  const activeIndex = Math.min(active, Math.max(0, shown.length - 1));

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (shown.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => {
        const from = Math.min(current, Math.max(0, shown.length - 1));
        const next = event.key === 'ArrowDown' ? from + 1 : from - 1;
        return (next + shown.length) % shown.length;
      });
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActive(shown.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const option = shown[activeIndex];
      if (option) choose(option.value);
    }
  };

  return (
    <>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className={className ? `select-trigger ${className}` : 'select-trigger'}
        disabled={disabled}
        aria-label={`${label}, ${selected?.label ?? placeholder}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          const index = options.findIndex((option) => option.value === value);
          setActive(index >= 0 ? index : 0);
          setOpen(true);
        }}
      >
        <span className={selected ? undefined : 'select-placeholder'}>{selected?.label ?? placeholder}</span>
        <ChevronDown strokeWidth={1.75} aria-hidden />
      </button>

      <dialog
        ref={dialogRef}
        className="select-popup"
        aria-label={label}
        onCancel={(event) => {
          if (event.target !== dialogRef.current) return;
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current) close();
        }}
      >
        {options.length > searchThreshold && (
          <input
            type="search"
            className="select-search"
            placeholder={`Search ${label.toLowerCase()}`}
            aria-label={`Search ${label.toLowerCase()}`}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
        )}
        <ul
          ref={listRef}
          className="select-list"
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          aria-activedescendant={shown[activeIndex] ? `${listId}-${shown[activeIndex].value}` : undefined}
          onKeyDown={onKeyDown}
        >
          {shown.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-${option.value}`}
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
            <li className="select-empty">
              {search.trim() ? `Nothing matches “${search.trim()}”.` : emptyText}
            </li>
          )}
        </ul>
      </dialog>
    </>
  );
}
