import { defineConfig } from 'vitest/config';

// Unit tests run in Node by default. A test file that needs a DOM opts in with
// a `// @vitest-environment happy-dom` comment on its first line.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
  },
});
