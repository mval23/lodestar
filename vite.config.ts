/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

type VercelConfig = { headers: { source: string; headers: { key: string; value: string }[] }[] };
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as VercelConfig;
const siteHeaders = vercel.headers.find((h) => h.source === '/(.*)')?.headers ?? [];

// Vercel's header CSP allows any *.supabase.co project, because vercel.json
// can't read environment variables. At build time this plugin adds a second
// CSP as a <meta> tag that allows only this build's project. Browsers enforce
// both policies, so the effective connect-src is the exact origin.
function supabaseConnectCsp(supabaseUrl: string | undefined): Plugin {
  return {
    name: 'lodestar-connect-csp',
    apply: 'build',
    transformIndexHtml() {
      if (!supabaseUrl) return [];
      const origin = new URL(supabaseUrl).origin;
      const ws = origin.replace(/^http/, 'ws');
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: `connect-src 'self' ${origin} ${ws}` },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

// `vite preview` serves the production headers so CSP problems show up
// locally. HSTS and upgrade-insecure-requests are dropped because preview is
// plain http, and the local Supabase origin is allowed.
function previewHeaders(supabaseUrl: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, value } of siteHeaders) {
    if (key === 'Strict-Transport-Security') continue;
    if (key === 'Content-Security-Policy') {
      const origin = supabaseUrl ? new URL(supabaseUrl).origin : '';
      out[key] = value
        .replace('; upgrade-insecure-requests', '')
        .replace("connect-src 'self'", `connect-src 'self' ${origin} ${origin.replace(/^http/, 'ws')}`.trim());
      continue;
    }
    out[key] = value;
  }
  return out;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), supabaseConnectCsp(env.VITE_SUPABASE_URL)],
    preview: { headers: previewHeaders(env.VITE_SUPABASE_URL) },
    build: { target: 'es2022', sourcemap: false },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      // The Notion migration tooling lives outside src/: it is a one-time
      // local script, not part of the app people download.
      // The delete-account guard is the other thing outside src/ that has to
      // be right, so its tests run here too.
      include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs', 'supabase/functions/**/*.test.ts'],
    },
  };
});
