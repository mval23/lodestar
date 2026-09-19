import type { ReactNode } from 'react';
import { Wordmark } from '../../ui/Logo';

export function AuthLayout({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="auth">
      <div className="auth-panel">
        <header className="auth-head">
          <Wordmark size={26} />
          <h1 className="large-title">{title}</h1>
          {intro && <p className="secondary flush">{intro}</p>}
        </header>
        {children}
        <p className="auth-foot">Know where you stand.</p>
      </div>
    </main>
  );
}
