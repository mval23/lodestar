import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Check, Plus } from 'lucide-react';
import { PHONE, useMediaQuery } from '../../lib/media';
import { Button } from '../../ui/Button';
import { dataErrorMessage } from '../auth/errors';
import { useCreateCategory, type CategoryKind } from '../categories/queries';
import { categoryKey, useTourProgress } from './progress';
import { TOUR_STEPS } from './steps';

// Whether this browser has been shown the tour, so a first run starts it once
// rather than on every visit. It is set as the tour starts: the tour itself
// returns to the Overview, and a reload halfway through shouldn't start it
// over. A per-browser convenience: lost storage only means it starts again.
const SEEN_KEY = 'lodestar.tour';

export function hasSeenTour(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === 'seen';
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, 'seen');
  } catch {
    // Nothing to do: the tour will simply be offered again.
  }
}

type TourContextValue = { active: boolean; start: () => void };

const TourContext = createContext<TourContextValue>({ active: false, start: () => {} });

export function useTour(): TourContextValue {
  return useContext(TourContext);
}

// Lives in the app shell, so the tour can move from page to page.
export function TourProvider({ children }: { children: ReactNode }) {
  const [index, setIndex] = useState<number | null>(null);
  const start = useCallback(() => {
    markSeen();
    setIndex(0);
  }, []);
  const end = useCallback(() => setIndex(null), []);
  const value = useMemo(() => ({ active: index !== null, start }), [index, start]);

  return (
    <TourContext.Provider value={value}>
      {children}
      {index !== null && <TourOverlay index={index} onIndex={setIndex} onEnd={end} />}
    </TourContext.Provider>
  );
}

type Box = { top: number; left: number; width: number; height: number };
type Measured = {
  key: string;
  boxes: Box[];
  anchor: Box | null;
  anchorInSidebar: boolean;
  onPage: number;
};

// Room left around a lit element, and between it and the card.
const PAD = 6;
const GAP = 12;
const GUTTER = 16;
const CARD_WIDTH = 360;
// How long to wait for a page to draw its targets before going on without.
const SETTLE_MS = 250;
const GIVE_UP_MS = 600;

const isShown = (el: Element) => el.getClientRects().length > 0;

// The app's menus: the sidebar, the phone's tab bar and its top bar. Lit
// menu items show where a page lives; they aren't for clicking mid-tour.
const NAVIGATION = '.sidebar, .tab-bar, .mobile-bar';

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

function union(boxes: Box[]): Box {
  const top = Math.min(...boxes.map((b) => b.top));
  const left = Math.min(...boxes.map((b) => b.left));
  const bottom = Math.max(...boxes.map((b) => b.top + b.height));
  const right = Math.max(...boxes.map((b) => b.left + b.width));
  return { top, left, width: right - left, height: bottom - top };
}

// The part of the screen not covered by the phone's top bar and tab bar.
function visibleBand(): { top: number; bottom: number } {
  const edge = (selector: string, side: 'top' | 'bottom') => {
    const el = document.querySelector(selector);
    if (!el || !isShown(el)) return null;
    return el.getBoundingClientRect()[side];
  };
  return { top: edge('.mobile-bar', 'bottom') ?? 0, bottom: edge('.tab-bar', 'top') ?? window.innerHeight };
}

function TourOverlay({
  index,
  onIndex,
  onEnd,
}: {
  index: number;
  onIndex: (index: number) => void;
  onEnd: () => void;
}) {
  const step = TOUR_STEPS[index]!;
  const last = index === TOUR_STEPS.length - 1;
  const phone = useMediaQuery(PHONE);
  const path = step.path;
  const key = step.id;
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const progress = useTourProgress();
  const [settled, setSettled] = useState<string | null>(null);
  const [measured, setMeasured] = useState<Measured | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const arrived = useRef<string | null>(null);

  // Open the step's page once, as the step begins. If the person then leaves
  // it some other way, such as the browser's back button, the tour ends.
  useEffect(() => {
    if (pathname === path) {
      arrived.current = key;
      return;
    }
    if (arrived.current === key) onEnd();
    else navigate(path);
  }, [key, path, pathname, navigate, onEnd]);

  // What the step points at, as the page stands right now. Looked up afresh
  // each time, since a page can draw a target late (once its data arrives)
  // or draw it again.
  const findTargets = useCallback(
    () =>
      step.targets
        .flatMap((target) => Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)))
        .filter(isShown),
    [step.targets],
  );

  // Once on the page, give it a moment to draw what the step points at, then
  // bring that into view, clear of the bars that sit over it.
  useEffect(() => {
    if (pathname !== path) return;
    const started = performance.now();
    const named = step.targets.some((target) => !target.startsWith('nav-'));
    let frame = 0;
    const look = () => {
      const elements = findTargets();
      const waited = performance.now() - started;
      const hasPageTarget = elements.some((el) => !named || !el.dataset.tour?.startsWith('nav-'));
      if (step.targets.length > 0 && !(hasPageTarget && waited >= SETTLE_MS) && waited < GIVE_UP_MS) {
        frame = requestAnimationFrame(look);
        return;
      }
      const onPage = elements.filter((el) => !el.closest(NAVIGATION));
      const anchor = onPage[onPage.length - 1];
      if (anchor) {
        const rect = anchor.getBoundingClientRect();
        const { top, bottom } = visibleBand();
        if (rect.top < top || rect.bottom > bottom) anchor.scrollIntoView({ block: 'center' });
      }
      setSettled(key);
    };
    frame = requestAnimationFrame(look);
    return () => cancelAnimationFrame(frame);
  }, [key, pathname, path, step.targets, findTargets]);

  // Measure, and again whenever the page scrolls, resizes, or changes shape,
  // such as a list growing once an account is added.
  useEffect(() => {
    if (settled !== key) return;
    const measure = () => {
      const elements = findTargets();
      const boxes = elements.map((el) => {
        const rect = el.getBoundingClientRect();
        return { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 };
      });
      // The card goes round everything lit on the page itself, so it never
      // covers one of them. Only a step with nothing but menu items to show
      // places it by those.
      const onPage = boxes.filter((_, i) => !elements[i]!.closest(NAVIGATION));
      const lastElement = elements[elements.length - 1];
      setMeasured({
        key,
        boxes,
        anchor: onPage.length > 0 ? union(onPage) : (boxes[boxes.length - 1] ?? null),
        anchorInSidebar: onPage.length === 0 && Boolean(lastElement?.closest('.sidebar')),
        onPage: onPage.length,
      });
    };
    const frame = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    // The page itself, not the body: on a short page the body stays the
    // height of the screen while what's on it moves.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    for (const el of document.querySelectorAll('.main > *')) observer?.observe(el);
    observer?.observe(document.body);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      observer?.disconnect();
    };
  }, [settled, key, findTargets]);

  // While one of the app's sheets is open, the tour steps aside: the sheet is
  // where the work is, and the tour picks up again when it closes.
  useEffect(() => {
    const check = () => setSheetOpen(document.querySelector('dialog[open]') !== null);
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'], childList: true });
    return () => observer.disconnect();
  }, []);

  // What's lit on the page can be used: a button to add, a field to fill in.
  // Everything else is dimmed and does nothing until the tour moves on. Links
  // inside a lit area would leave the page, so they wait too.
  useEffect(() => {
    const usable = (target: Element) => {
      if (card.current?.contains(target)) return true;
      if (target.closest('dialog[open]')) return true;
      if (target.closest('a')) return false;
      return findTargets().some((el) => !el.closest(NAVIGATION) && el.contains(target));
    };
    const guard = (event: Event) => {
      if (event.target instanceof Element && usable(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const types = ['click', 'pointerdown', 'mousedown'] as const;
    for (const type of types) document.addEventListener(type, guard, true);
    return () => {
      for (const type of types) document.removeEventListener(type, guard, true);
    };
  }, [findTargets]);

  const current = measured?.key === key ? measured : null;
  const ready = current !== null && !sheetOpen;
  const done = step.progress ? step.progress(progress) : null;
  const waiting = Boolean(step.progress) && done === null;

  const next = useCallback(() => (last ? onEnd() : onIndex(index + 1)), [last, onEnd, onIndex, index]);
  const back = useCallback(() => index > 0 && onIndex(index - 1), [onIndex, index]);

  // Focus the way forward as each step's card appears. It is hidden while the
  // step finds its targets, and a hidden button can't take focus.
  useEffect(() => {
    if (ready) card.current?.querySelector<HTMLButtonElement>('[data-tour-next]')?.focus();
  }, [ready, key, waiting]);

  // Keys work wherever focus has wandered, except in a field or a sheet:
  // Escape ends, the arrows step, and Tab stays within the card.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]') || isEditable(event.target)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onEnd();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        next();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        back();
      } else if (event.key === 'Tab') {
        const inCard = card.current?.contains(document.activeElement) ?? false;
        if (!inCard && document.activeElement !== document.body) return;
        const buttons = Array.from(card.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []);
        if (buttons.length === 0) return;
        const at = buttons.indexOf(document.activeElement as HTMLElement);
        const to = at === -1 ? 0 : (at + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        event.preventDefault();
        buttons[to]!.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [next, back, onEnd]);

  if (sheetOpen) return null;

  const boxes = current?.boxes ?? [];
  const body =
    current && current.onPage === 0 && step.emptyBody
      ? step.emptyBody
      : phone && step.phoneBody
        ? step.phoneBody
        : step.body;

  return (
    <div className="tour">
      <svg className="tour-scrim" aria-hidden="true">
        <defs>
          <mask id="tour-holes">
            <rect width="100%" height="100%" fill="white" />
            {boxes.map((box, i) => (
              <rect key={i} x={box.left} y={box.top} width={box.width} height={box.height} rx="12" fill="black" />
            ))}
          </mask>
        </defs>
        <rect className="tour-shade" width="100%" height="100%" mask="url(#tour-holes)" />
      </svg>
      {boxes.map((box, i) => (
        <div key={i} className="tour-ring" style={box} aria-hidden="true" />
      ))}

      <div
        key={step.id}
        ref={card}
        className="tour-card"
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        data-ready={ready || undefined}
        style={current ? placeCard(current) : undefined}
      >
        <p className="caption flush">
          {index + 1} of {TOUR_STEPS.length}
        </p>
        <h2 className="headline" id="tour-title">
          {step.title}
        </h2>
        <p className="callout flush" id="tour-body">
          {body}
        </p>
        {step.starters && <Starters existing={progress.existing} />}
        {done && (
          <p className="tour-done flush" role="status">
            <Check strokeWidth={2} aria-hidden />
            {done}
          </p>
        )}
        <div className="tour-actions">
          {!last && (
            <Button variant="plain" onClick={onEnd}>
              End tour
            </Button>
          )}
          <div className="actions">
            {index > 0 && (
              <Button variant="secondary" onClick={back}>
                Back
              </Button>
            )}
            {waiting ? (
              <Button variant="secondary" data-tour-next onClick={next}>
                Skip
              </Button>
            ) : (
              <Button data-tour-next onClick={next}>
                {last ? 'Done' : 'Next'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// A few common categories to add with one tap, so nobody starts from a blank
// page. Only what's tapped is created, ungrouped; grouping can come later.
const STARTERS: { kind: CategoryKind; names: string[] }[] = [
  {
    kind: 'expense',
    names: ['Housing', 'Groceries', 'Utilities', 'Transport', 'Eating out', 'Health', 'Shopping', 'Entertainment'],
  },
  { kind: 'income', names: ['Salary', 'Other income'] },
];

function Starters({ existing }: { existing: Set<string> }) {
  const create = useCreateCategory();
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = async (kind: CategoryKind, name: string) => {
    setError(null);
    setAdding(categoryKey(kind, name));
    try {
      await create.mutateAsync({ kind, name });
    } catch (cause) {
      setError(dataErrorMessage(cause));
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="stack-tight">
      {STARTERS.map(({ kind, names }) => (
        <div key={kind} className="choice-chips" role="group" aria-label={kind === 'expense' ? 'Spending' : 'Income'}>
          {names.map((name) => {
            const key = categoryKey(kind, name);
            const added = existing.has(key);
            return (
              <button
                key={key}
                type="button"
                className="choice-chip"
                aria-pressed={added}
                aria-busy={adding === key || undefined}
                disabled={added || adding !== null}
                onClick={() => add(kind, name)}
              >
                {added ? <Check strokeWidth={2} aria-hidden /> : <Plus strokeWidth={2} aria-hidden />}
                {name}
              </button>
            );
          })}
        </div>
      ))}
      {error && <p className="field-error flush">{error}</p>}
    </div>
  );
}

// Where the card goes: beside a sidebar item, otherwise below what it points
// at when that sits in the top half of the screen and above it when it sits
// in the bottom half, so the tab bar and the foot of a page stay in view.
// With nothing to point at, it waits in the middle.
function placeCard({ anchor, anchorInSidebar }: Measured): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(CARD_WIDTH, vw - GUTTER * 2);
  if (!anchor) return { width, left: (vw - width) / 2, top: '50%', transform: 'translateY(-50%)' };

  const clampLeft = (left: number) => Math.max(GUTTER, Math.min(left, vw - width - GUTTER));
  if (anchorInSidebar) {
    return {
      width,
      left: clampLeft(anchor.left + anchor.width + GAP),
      top: Math.max(GUTTER, Math.min(anchor.top, vh - 320)),
    };
  }
  const left = clampLeft(anchor.left + anchor.width / 2 - width / 2);
  const below = anchor.top + anchor.height / 2 < vh / 2;
  return below
    ? { width, left, top: anchor.top + anchor.height + GAP, maxHeight: vh - (anchor.top + anchor.height + GAP) - GUTTER }
    : { width, left, bottom: vh - anchor.top + GAP, maxHeight: anchor.top - GAP - GUTTER };
}
