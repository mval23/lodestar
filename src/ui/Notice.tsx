import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';

type Tone = 'info' | 'ok' | 'warn' | 'err';

const ICONS = { info: Info, ok: CircleCheck, warn: TriangleAlert, err: CircleAlert } as const;

// Status is always an icon plus words, never color alone.
export function Notice({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  const Icon = ICONS[tone];
  return (
    <div className={`notice notice-${tone}`} role={tone === 'err' ? 'alert' : 'status'}>
      <Icon strokeWidth={1.75} aria-hidden />
      <div>{children}</div>
    </div>
  );
}
