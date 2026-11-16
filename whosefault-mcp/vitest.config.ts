import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: process.platform === 'win32' ? 'vmThreads' : 'forks',
    include: ['tests/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
  },
});
