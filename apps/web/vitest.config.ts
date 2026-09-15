import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      engine: fileURLToPath(new URL('../../packages/engine/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
    environment: 'jsdom',
    globals: false,
    // Pinned so the suite does not depend on whether a developer has a local
    // .env.local. No request is ever made to these.
    env: {
      VITE_SUPABASE_URL: 'http://supabase.test',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
});
