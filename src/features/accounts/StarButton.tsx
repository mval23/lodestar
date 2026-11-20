import { Star } from 'lucide-react';
import { useSetFavorite } from './queries';

// The star that makes an account a favorite: on the Accounts list beside
// each row, and on the account's own page beside its name. It fills at once;
// the list catches up when the database answers.
export function StarButton({
  accountId,
  name,
  favorite,
  size = 18,
}: {
  accountId: string;
  name: string;
  favorite: boolean;
  size?: number;
}) {
  const setFavorite = useSetFavorite();
  return (
    <button
      type="button"
      className="star-toggle"
      aria-pressed={favorite}
      aria-label={`Favorite: ${name}`}
      onClick={() => setFavorite.mutate({ id: accountId, favorite: !favorite })}
    >
      <Star size={size} strokeWidth={1.75} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />
    </button>
  );
}
