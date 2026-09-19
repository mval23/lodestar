import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { envResult } from './env';

export type Supabase = SupabaseClient<Database>;

// Null when the build has no valid configuration; main.tsx shows a setup
// screen instead of the app in that case.
export const supabase: Supabase | null = envResult.ok
  ? createClient<Database>(envResult.env.VITE_SUPABASE_URL, envResult.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export function db(): Supabase {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}
