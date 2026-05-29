import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['model/**/*.test.js'],
  },
});
