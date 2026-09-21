import type { ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';

// Inset grouped list: one white group, label on the left, value on the right.
export function FormGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div>
      {title && <h2 className="form-group-title">{title}</h2>}
      <div className="form-group">{children}</div>
    </div>
  );
}

export function FormRow({
  label,
  htmlFor,
  invalid,
  children,
}: {
  label: string;
  htmlFor?: string;
  invalid?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="form-row" data-invalid={invalid || undefined}>
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span className="form-label">{label}</span>}
      {children}
    </div>
  );
}

// Field errors listed under the group, in words.
//
// Until the person has tried to save, the reason is a hint, not an error: a
// sheet that opens with "Enter an amount." in red is telling someone off for
// something they haven't done yet. The words are the same either way, so
// what the dimmed button is waiting for is never a mystery.
export function FieldErrors({
  messages,
  attempted = true,
}: {
  messages: (string | undefined)[];
  attempted?: boolean;
}) {
  const list = messages.filter((m): m is string => Boolean(m));
  if (list.length === 0) return null;
  if (!attempted) {
    return (
      <div>
        {list.map((m) => (
          <p key={m} className="form-hint">
            {m}
          </p>
        ))}
      </div>
    );
  }
  return (
    <div role="alert">
      {list.map((m) => (
        <p key={m} className="field-error">
          <CircleAlert strokeWidth={1.75} aria-hidden />
          {m}
        </p>
      ))}
    </div>
  );
}
