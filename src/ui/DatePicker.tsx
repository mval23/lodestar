import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDate, todayInZone } from '../lib/dates';
import { useProfile } from '../lib/profile';
import {
  addDays,
  addMonthsClamped,
  clampDay,
  endOfWeek,
  firstOfMonth,
  isIsoDate,
  monthGrid,
  startOfWeek,
} from '../lib/calendar';

// A date field that matches the app, because the browser's own calendar is
// drawn by the operating system and cannot be styled. Like Select, the
// calendar lives in a <dialog>, so Esc, focus trapping and inertness come
// from the browser. The days are a grid in the WAI-ARIA date picker pattern:
// arrow keys move a day or a week, Page Up and Page Down a month (with Shift,
// a year), Home and End the start and end of the week, Enter chooses.
//
// The value is an ISO date ("2026-10-17") or '' for none.

const WEEKDAYS = [
  ['S', 'Sunday'],
  ['M', 'Monday'],
  ['T', 'Tuesday'],
  ['W', 'Wednesday'],
  ['T', 'Thursday'],
  ['F', 'Friday'],
  ['S', 'Saturday'],
] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const monthTitle = (day: string) =>
  new Date(`${firstOfMonth(day)}T00:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function DatePicker({
  id,
  value,
  onChange,
  label,
  placeholder = 'Choose a date',
  clearable = false,
  min,
  max,
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  // What the field says with no date: "Any date", "Never", "Optional".
  placeholder?: string;
  // Offers "Clear", for a date that may be left empty.
  clearable?: boolean;
  min?: string;
  max?: string;
  // Extra classes for the trigger, where it sits somewhere different.
  className?: string;
}) {
  const profile = useProfile();
  const today = todayInZone(profile.data?.timezone);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLTableElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'days' | 'months'>('days');
  // The day the keyboard is on; the month shown is the one it sits in.
  const [focus, setFocus] = useState(today);
  // Set by the keyboard, so focus follows it; a click leaves focus alone.
  const moved = useRef(false);
  const titleId = useId();

  const chosen = isIsoDate(value) ? value : '';
  const inRange = (day: string) => (!min || day >= min) && (!max || day <= max);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const choose = (day: string) => {
    if (!inRange(day)) return;
    onChange(day);
    close();
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Under the trigger on a wide screen; a bottom sheet on a narrow one.
      const trigger = triggerRef.current?.getBoundingClientRect();
      if (trigger && window.matchMedia?.('(min-width: 561px)').matches) {
        const width = 304;
        const left = Math.min(Math.max(8, trigger.left), window.innerWidth - width - 8);
        const below = window.innerHeight - trigger.bottom;
        dialog.style.width = `${width}px`;
        dialog.style.left = `${left}px`;
        dialog.style.margin = '0';
        if (below < 380 && trigger.top > below) {
          dialog.style.top = 'auto';
          dialog.style.bottom = `${window.innerHeight - trigger.top + 6}px`;
        } else {
          dialog.style.top = `${trigger.bottom + 6}px`;
          dialog.style.bottom = 'auto';
        }
      }
      moved.current = true;
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // After a keyboard move (or opening), the focused day takes focus.
  useEffect(() => {
    if (!open || view !== 'days' || !moved.current) return;
    moved.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus();
  }, [open, view, focus]);

  const go = (day: string) => {
    moved.current = true;
    setFocus(clampDay(day, min, max));
  };

  const onGridKey = (event: KeyboardEvent<HTMLTableElement>) => {
    const keys: Record<string, () => string> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      Home: () => startOfWeek(focus),
      End: () => endOfWeek(focus),
      PageUp: () => addMonthsClamped(focus, event.shiftKey ? -12 : -1),
      PageDown: () => addMonthsClamped(focus, event.shiftKey ? 12 : 1),
    };
    const next = keys[event.key];
    if (!next) return;
    event.preventDefault();
    go(next());
  };

  const showMonth = (delta: number) => {
    // The month changes; the keyboard's day comes along to the same date.
    setFocus(clampDay(addMonthsClamped(focus, delta), min, max));
  };

  const year = Number(focus.slice(0, 4));

  return (
    <>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className={`select-trigger date-trigger${className ? ` ${className}` : ''}`}
        aria-label={`${label}, ${chosen ? formatDate(chosen) : placeholder}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setFocus(clampDay(chosen || today, min, max));
          setView('days');
          setOpen(true);
        }}
      >
        <span className={chosen ? undefined : 'select-placeholder'}>{chosen ? formatDate(chosen) : placeholder}</span>
        <CalendarDays strokeWidth={1.75} aria-hidden />
      </button>

      <dialog
        ref={dialogRef}
        className="select-popup date-popup"
        aria-label={label}
        onCancel={(event) => {
          if (event.target !== dialogRef.current) return;
          event.preventDefault();
          if (view === 'months') return setView('days');
          close();
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current) close();
        }}
      >
        {open && (
          <>
            <div className="date-head">
              <button
                type="button"
                className="date-nav"
                aria-label={view === 'days' ? 'Previous month' : 'Previous year'}
                onClick={() => showMonth(view === 'days' ? -1 : -12)}
              >
                <ChevronLeft strokeWidth={1.75} aria-hidden />
              </button>
              <button
                type="button"
                className="date-title"
                id={titleId}
                aria-live="polite"
                aria-label={view === 'days' ? `${monthTitle(focus)}, choose another month` : `${year}, back to the days`}
                onClick={() => {
                  moved.current = true;
                  setView(view === 'days' ? 'months' : 'days');
                }}
              >
                {view === 'days' ? monthTitle(focus) : year}
              </button>
              <button
                type="button"
                className="date-nav"
                aria-label={view === 'days' ? 'Next month' : 'Next year'}
                onClick={() => showMonth(view === 'days' ? 1 : 12)}
              >
                <ChevronRight strokeWidth={1.75} aria-hidden />
              </button>
            </div>

            {view === 'days' ? (
              <table ref={gridRef} className="date-grid" role="grid" aria-labelledby={titleId} onKeyDown={onGridKey}>
                <thead>
                  <tr>
                    {WEEKDAYS.map(([short, long]) => (
                      <th key={long} scope="col" abbr={long}>
                        {short}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthGrid(focus).map((week) => (
                    <tr key={week[0]}>
                      {week.map((day) => {
                        const classes = [
                          'date-day',
                          day.slice(0, 7) !== focus.slice(0, 7) && 'outside',
                          day === today && 'today',
                          day === chosen && 'chosen',
                        ]
                          .filter(Boolean)
                          .join(' ');
                        return (
                          <td key={day} role="gridcell" aria-selected={day === chosen}>
                            <button
                              type="button"
                              className={classes}
                              tabIndex={day === focus ? 0 : -1}
                              disabled={!inRange(day)}
                              aria-label={`${formatDate(day)}${day === today ? ', today' : ''}`}
                              onClick={() => choose(day)}
                            >
                              {Number(day.slice(8))}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="date-months" role="group" aria-label={`Months of ${year}`}>
                {MONTHS.map((name, index) => {
                  const month = `${year}-${String(index + 1).padStart(2, '0')}`;
                  const current = month === focus.slice(0, 7);
                  return (
                    <button
                      key={name}
                      type="button"
                      className={current ? 'date-month current' : 'date-month'}
                      aria-pressed={current}
                      autoFocus={current}
                      onClick={() => {
                        moved.current = true;
                        // From the keyboard's month to this one, keeping the day.
                        const months = (year - Number(focus.slice(0, 4))) * 12 + index - (Number(focus.slice(5, 7)) - 1);
                        setFocus(clampDay(addMonthsClamped(focus, months), min, max));
                        setView('days');
                      }}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="date-foot">
              {inRange(today) && (
                <button type="button" className="date-foot-button" onClick={() => choose(today)}>
                  Today
                </button>
              )}
              {clearable && chosen && (
                <button
                  type="button"
                  className="date-foot-button"
                  onClick={() => {
                    onChange('');
                    close();
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
