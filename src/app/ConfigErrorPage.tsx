import { Wordmark } from '../ui/Logo';
import { Notice } from '../ui/Notice';

// Shown when the build is missing its Supabase settings. Names only the
// variables, never their values.
export function ConfigErrorPage({ problems }: { problems: string[] }) {
  return (
    <main className="auth">
      <div className="auth-panel">
        <header className="auth-head">
          <Wordmark size={26} />
          <h1 className="large-title">Lodestar isn’t configured</h1>
        </header>
        <Notice tone="warn">
          <p>This build is missing its connection settings. Copy .env.example to .env.local and fill it in.</p>
        </Notice>
        {import.meta.env.DEV && (
          <ul className="footnote">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
