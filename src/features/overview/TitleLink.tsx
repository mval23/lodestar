import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';

// A caption that is also the way to the page behind it.
export function TitleLink({ to, children }: { to: string; children: string }) {
  return (
    <Link className="card-title-link" to={to}>
      {children}
      <ChevronRight strokeWidth={1.75} aria-hidden />
    </Link>
  );
}
