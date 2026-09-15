import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The engine is consumed as TypeScript source rather than as a built package,
 * so there is no build-order dance in dev and never a stale `dist` to debug.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      engine: fileURLToPath(new URL('../../packages/engine/src/index.ts', import.meta.url)),
    },
  },
  server: { port: 5173 },
});
