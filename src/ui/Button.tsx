import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'plain';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  block?: boolean;
  // Looks dimmed but stays clickable, so pressing it reveals the reason in words.
  dimmed?: boolean;
  busy?: boolean;
};

export function Button({ variant = 'primary', block, dimmed, busy, className, children, type, ...rest }: Props) {
  const classes = ['btn', `btn-${variant}`, block && 'btn-block', className].filter(Boolean).join(' ');
  return (
    <button
      type={type ?? 'button'}
      className={classes}
      aria-disabled={dimmed || busy ? true : undefined}
      aria-busy={busy || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}
