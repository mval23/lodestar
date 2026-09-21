import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';

export function NotFoundPage() {
  return (
    <div className="page">
      <EmptyState
        icon={Compass}
        title="This page doesn’t exist"
        action={
          <Link className="btn btn-primary" to="/">
            Go to Overview
          </Link>
        }
      >
        Check the address, or head back to your overview.
      </EmptyState>
    </div>
  );
}
