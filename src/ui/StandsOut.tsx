import { Info } from 'lucide-react';
import type { Currency } from '../lib/money';
import type { Finding } from '../lib/standsOut';
import { Amount } from './Amount';

// The one or two sentences a dashboard leads with. Says nothing at all when
// nothing is unusual: a line that is always there stops being read.
export function StandsOut({ findings, currency, max = 2 }: { findings: Finding[]; currency: Currency; max?: number }) {
  const shown = findings.slice(0, max);
  if (shown.length === 0) return null;
  return (
    <p className="stands-out">
      <Info strokeWidth={1.75} aria-hidden />
      <span>
        <span className="visually-hidden">What stands out: </span>
        {shown.map((finding, i) => (
          <span key={finding.key}>
            {i > 0 && ' '}
            {finding.parts.map((part, j) =>
              typeof part === 'string' ? (
                <span key={j}>{part}</span>
              ) : (
                <strong key={j}>
                  <Amount minor={part.minor} currency={currency} signed={part.signed} />
                </strong>
              ),
            )}
          </span>
        ))}
      </span>
    </p>
  );
}
