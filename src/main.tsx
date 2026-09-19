import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import './app/styles.css';
import { envResult } from './lib/env';
import { AuthProvider } from './app/AuthProvider';
import { ConfigErrorPage } from './app/ConfigErrorPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
    mutations: { retry: 0 },
  },
});

async function start() {
  const root = createRoot(document.getElementById('root')!);
  if (!envResult.ok) {
    root.render(<ConfigErrorPage problems={envResult.problems} />);
    return;
  }
  // Imported only once configuration is valid: routes create the client.
  const { router } = await import('./app/router');
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

void start();
