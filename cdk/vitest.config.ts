import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['{src,test}/**/*.{test,spec}.ts'],
    reporters: ['default', ['junit', { outputFile: 'test-reports/junit.xml' }]],
    coverage: {
      provider: 'v8',
      reporter: ['json', 'lcov', 'clover', 'cobertura', 'text'],
      reportsDirectory: 'coverage',
    },
  },
});
