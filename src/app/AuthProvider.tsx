import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '../lib/supabase';

type AuthState = { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; session: Session };

const AuthContext = createContext<AuthState>({ status: 'loading' });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = db();
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setState(data.session ? { status: 'signed-in', session: data.session } : { status: 'signed-out' });
    });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'SIGNED_OUT') {
        // Never leave one person's cached rows around for the next sign-in.
        queryClient.clear();
      }
      setState(session ? { status: 'signed-in', session } : { status: 'signed-out' });
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function useSession(): Session {
  const state = useAuth();
  if (state.status !== 'signed-in') throw new Error('useSession needs a signed-in route.');
  return state.session;
}
