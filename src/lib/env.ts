import { z } from 'zod';

const EnvSchema = z.object({
  VITE_SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  VITE_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(20)
    // The service-role / secret key must never reach the browser.
    .refine((k) => !k.startsWith('sb_secret_') && !isServiceRoleJwt(k), 'This is a secret key. Use the publishable key.'),
});

function isServiceRoleJwt(key: string): boolean {
  const payload = key.split('.')[1];
  if (!payload) return false;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string };
    return json.role === 'service_role';
  } catch {
    return false;
  }
}

export type Env = z.infer<typeof EnvSchema>;

export type EnvResult = { ok: true; env: Env } | { ok: false; problems: string[] };

export function parseEnv(raw: Record<string, unknown>): EnvResult {
  const result = EnvSchema.safeParse(raw);
  if (result.success) return { ok: true, env: result.data };
  return { ok: false, problems: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
}

export const envResult = parseEnv(import.meta.env);
