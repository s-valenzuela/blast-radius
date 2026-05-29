import { defineConfig } from 'vitest/config';

// Only the source model tests — not the copies Maven drops into target/classes.
export default defineConfig({
  test: {
    include: ['src/main/resources/static/model/**/*.test.js'],
  },
});
