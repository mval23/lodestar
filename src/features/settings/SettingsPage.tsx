import { useState } from 'react';
import { Link } from 'react-router';
import { LogOut } from 'lucide-react';
import { useSession } from '../../app/AuthProvider';
import { db } from '../../lib/supabase';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { authErrorMessage, dataErrorMessage } from '../auth/errors';
import { DeleteAccountPanel } from './DeleteAccountPanel';
import { PasswordForm } from './PasswordForm';
import { ProfileForm } from './ProfileForm';
import { useProfile } from '../../lib/profile';

export function SettingsPage() {
  const session = useSession();
  const profile = useProfile();
  const email = session.user.email ?? '';
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const signOut = async (scope: 'local' | 'global') => {
    setSignOutError(null);
    const { error } = await db().auth.signOut({ scope });
    if (error) setSignOutError(authErrorMessage(error));
  };

  return (
    <div className="page page-form">
      <header className="page-head">
        <h1 className="large-title">Settings</h1>
      </header>

      {profile.isPending && <p className="secondary">Loading your profile…</p>}
      {profile.isError && <Notice tone="err">{dataErrorMessage(profile.error)}</Notice>}
      {profile.data && <ProfileForm profile={profile.data} email={email} />}

      <section>
        <h2 className="form-group-title">Your data</h2>
        <ul className="rows-list">
          <li>
            <Link className="row-button" to="/categories">
              <span className="row-label">
                Categories
                <small>Rename, group, merge or archive what money was for</small>
              </span>
            </Link>
          </li>
          <li>
            <Link className="row-button" to="/import-export">
              <span className="row-label">
                Import &amp; export
                <small>Bring in a CSV from your bank, or export everything</small>
              </span>
            </Link>
          </li>
        </ul>
      </section>

      <PasswordForm email={email} />

      <section>
        <h2 className="form-group-title">Sessions</h2>
        <div className="group stack-tight">
          <p className="callout secondary flush">
            Signing out everywhere ends every session, including on your other devices.
          </p>
          <div className="actions">
            <Button variant="secondary" onClick={() => signOut('local')}>
              <LogOut strokeWidth={1.75} aria-hidden />
              Sign out
            </Button>
            <Button variant="plain" onClick={() => signOut('global')}>
              Sign out everywhere
            </Button>
          </div>
        </div>
      </section>
      {signOutError && <Notice tone="err">{signOutError}</Notice>}

      <DeleteAccountPanel email={email} />
    </div>
  );
}
