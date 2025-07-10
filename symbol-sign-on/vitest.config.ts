import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      exclude: [
        'node_modules/',
        'dist/',
        '__tests__/',
        'scripts/',
        'nginx/',
        'ssl/',
        'backups/',
        'data/',
        'logs/',
        'mongo-init/',
        'public/',
        '*.config.*',
        'coverage/'
      ]
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
