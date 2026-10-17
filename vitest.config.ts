import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['tests/unit/**/*.test.ts'],
      environment: 'node',
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts'],
        // Pure logic is unit-tested; the DOM wiring is covered by the Playwright suite.
        exclude: ['src/main.ts', 'src/screen.ts'],
        reporter: ['text', 'lcov'],
      },
    },
  }),
);
