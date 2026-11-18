import { defineConfig } from 'vitest/config';

// Unit tests for framework-free logic only (no React Native in here).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
