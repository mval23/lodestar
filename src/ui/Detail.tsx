import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, Compass } from 'lucide-react';
import { EmptyState } from './EmptyState';

// The shape every detail page shares, in this order: back link and title,
// one key figure, a row of facets, one chart, the activity, then actions.
// Keeping the order fixed means a new page teaches nothing new.

export function DetailHeader({
  back,
  title,
  subtitle,
  actions,
  titleExtra,
}: {
  back: { to: string; label: string };
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  // Sits beside the title, such as previous and next month.
  titleExtra?: ReactNode;
}) {
  return (
    <header className="detail-head">
      <Link to={back.to} className="back-link">
        <ChevronLeft strokeWidth={1.75} aria-hidden />
        {back.label}
      </Link>
      <div className="page-head">
        <div className="detail-title">
          <div className="detail-title-row">
            <h1 className="large-title">{title}</h1>
            {titleExtra}
          </div>
          {subtitle && <p className="footnote flush">{subtitle}</p>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </div>
    </header>
  );
}

// The one blue bracket a screen is allowed.
export function KeyFigure({ label, children, footnote }: { label: string; children: ReactNode; footnote?: ReactNode }) {
  return (
    <section className="group figure-group key-figure">
      <h2 className="caption">{label}</h2>
      <p className="fig flush">
        <span className="bracket">{children}</span>
      </p>
      {footnote && <div className="footnote flush">{footnote}</div>}
    </section>
  );
}

export function Facets({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul className="facets" aria-label={label}>
      {children}
    </ul>
  );
}

export function Facet({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <li className="group facet">
      <span className="caption">{label}</span>
      <span className="facet-value">{children}</span>
      {note && <span className="facet-note">{note}</span>}
    </li>
  );
}

// The top of a figure row: the key figure beside its facets.
export function FigureRow({ children }: { children: ReactNode }) {
  return <div className="figure-row">{children}</div>;
}

export function SectionHead({ title, id, link }: { title: string; id?: string; link?: { to: string; label: string } }) {
  return (
    <div className="section-head">
      <h2 className="headline" id={id}>
        {title}
      </h2>
      {link && <Link to={link.to}>{link.label}</Link>}
    </div>
  );
}

// A missing record and another person's record look exactly alike: RLS makes
// the second simply absent, and the page must not tell them apart.
export function DetailNotFound({ what, back }: { what: string; back: { to: string; label: string } }) {
  return (
    <div className="page">
      <EmptyState
        icon={Compass}
        title={`This ${what} doesn’t exist`}
        action={
          <Link className="btn btn-primary" to={back.to}>
            Go to {back.label}
          </Link>
        }
      >
        It may have been deleted, or the address may be mistyped.
      </EmptyState>
    </div>
  );
}
