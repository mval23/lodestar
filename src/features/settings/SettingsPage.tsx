import { useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowDownUp,
  ChartPie,
  ChevronRight,
  KeyRound,
  ListChecks,
  LogOut,
  MonitorSmartphone,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useSession } from '../../app/AuthProvider';
import { db } from '../../lib/supabase';
import { Notice } from '../../ui/Notice';
import { Sheet } from '../../ui/Sheet';
import { authErrorMessage, dataErrorMessage } from '../auth/errors';
import { DeleteAccountPanel } from './DeleteAccountPanel';
import { PasswordForm } from './PasswordForm';
import { ProfileForm } from './ProfileForm';
import { useProfile } from '../../lib/profile';

// Settings in two columns on a wide screen: who you are and how amounts and
// dates read on the left, and your data, signing in and leaving on the right.
// A phone stacks them in that order. Changing the password and deleting the
// account are rare, so each is a row that opens a sheet rather than a form
// left open on the page.
export function SettingsPage() {
  const session = useSession();
  const profile = useProfile();
  const email = session.user.email ?? '';
  const [sheet, setSheet] = useState<'password' | 'delete' | null>(null);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const signOut = async (scope: 'local' | 'global') => {
    setSignOutError(null);
    const { error } = await db().auth.signOut({ scope });
    if (error) setSignOutError(authErrorMessage(error));
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="large-title">Settings</h1>
      </header>

      <div className="settings-grid">
        <div className="settings-col">
          {profile.isPending && <p className="secondary">Loading your profile…</p>}
          {profile.isError && <Notice tone="err">{dataErrorMessage(profile.error)}</Notice>}
          {profile.data && <ProfileForm profile={profile.data} email={email} />}
        </div>

        <div className="settings-col">
          <section aria-labelledby="settings-data">
            <h2 className="form-group-title" id="settings-data">
              Your data
            </h2>
            <ul className="rows-list">
              <SettingsLink
                to="/categories"
                icon={ChartPie}
                label="Categories"
                hint="Rename, group, merge or archive what money was for"
              />
              <SettingsLink
                to="/import-export"
                icon={ArrowDownUp}
                label="Import & export"
                hint="Bring in a CSV from your bank, or export everything"
              />
              <SettingsLink
                to="/welcome"
                icon={ListChecks}
                label="Setup guide"
                hint="Walk through accounts, categories, bills, budgets and goals again"
              />
            </ul>
          </section>

          <section aria-labelledby="settings-sign-in">
            <h2 className="form-group-title" id="settings-sign-in">
              Sign-in
            </h2>
            <ul className="rows-list">
              <li>
                <button
                  type="button"
                  className="row-button"
                  onClick={() => {
                    setPasswordChanged(false);
                    setSheet('password');
                  }}
                >
                  <KeyRound className="row-icon" strokeWidth={1.75} aria-hidden />
                  <span className="row-label row-grow">
                    Change password
                    <small>Asks for your current one first</small>
                  </span>
                  <ChevronRight className="row-chevron" strokeWidth={1.75} aria-hidden />
                </button>
              </li>
              <li>
                <button type="button" className="row-button row-action" onClick={() => signOut('local')}>
                  <LogOut className="row-icon" strokeWidth={1.75} aria-hidden />
                  <span className="row-label row-grow">Sign out</span>
                </button>
              </li>
              <li>
                <button type="button" className="row-button row-action" onClick={() => signOut('global')}>
                  <MonitorSmartphone className="row-icon" strokeWidth={1.75} aria-hidden />
                  <span className="row-label row-grow">
                    Sign out everywhere
                    <small>Ends every session, including on your other devices</small>
                  </span>
                </button>
              </li>
            </ul>
            {passwordChanged && <Notice tone="ok">Your password is changed.</Notice>}
            {signOutError && <Notice tone="err">{signOutError}</Notice>}
          </section>

          <section aria-labelledby="settings-leave">
            <h2 className="form-group-title" id="settings-leave">
              Your account
            </h2>
            <ul className="rows-list">
              <li>
                <button type="button" className="row-button row-danger" onClick={() => setSheet('delete')}>
                  <Trash2 className="row-icon" strokeWidth={1.75} aria-hidden />
                  <span className="row-label row-grow">
                    Delete account
                    <small>Removes your account and everything in it, for good</small>
                  </span>
                  <ChevronRight className="row-chevron" strokeWidth={1.75} aria-hidden />
                </button>
              </li>
            </ul>
          </section>
        </div>
      </div>

      {sheet === 'password' && (
        <Sheet open onClose={() => setSheet(null)} title="Change password">
          <PasswordForm
            email={email}
            onChanged={() => {
              setPasswordChanged(true);
              setSheet(null);
            }}
          />
        </Sheet>
      )}
      {sheet === 'delete' && (
        <Sheet open onClose={() => setSheet(null)} title="Delete account">
          <DeleteAccountPanel email={email} />
        </Sheet>
      )}
    </div>
  );
}

function SettingsLink({ to, icon: Icon, label, hint }: { to: string; icon: LucideIcon; label: string; hint: string }) {
  return (
    <li>
      <Link className="row-button" to={to}>
        <Icon className="row-icon" strokeWidth={1.75} aria-hidden />
        <span className="row-label row-grow">
          {label}
          <small>{hint}</small>
        </span>
        <ChevronRight className="row-chevron" strokeWidth={1.75} aria-hidden />
      </Link>
    </li>
  );
}
