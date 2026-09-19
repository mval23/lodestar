import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

// Large light-grey icon, one-line title, one sentence, at most one blue button.
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon strokeWidth={1.75} aria-hidden />
      <h2 className="headline">{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
