import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'unit',
    environment: 'node',
    include: ['tests/shared/**/*.test.ts', 'tests/src/**/*.test.ts'],
  },
});
