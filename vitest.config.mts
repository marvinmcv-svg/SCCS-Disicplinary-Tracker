import { defineConfig } from 'vitest/config';

// Server-side tests only. The client has its own vitest config with a jsdom
// environment; running both from the root would load browser tests into a node
// environment and fail on `window`.
export default defineConfig({
  test: {
    include: ['server/**/*.test.ts'],
    environment: 'node',
  },
});
