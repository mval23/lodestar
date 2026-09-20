import { Link } from 'react-router';
import { AuthLayout } from './AuthLayout';

// Where deletion lands. Public, and signed out by the time it renders: the
// account it would have belonged to no longer exists.
export function AccountDeletedPage() {
  return (
    <AuthLayout title="Your account is deleted" intro="Everything you kept in Lodestar has been removed.">
      <p className="secondary flush">
        Backups age out within the provider’s retention window, and nothing is kept past it. If you’d like to start
        again, you’re welcome any time.
      </p>
      <Link className="btn btn-primary" to="/sign-up">
        Create an account
      </Link>
    </AuthLayout>
  );
}
