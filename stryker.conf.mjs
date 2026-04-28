export default {
  packageManager: 'npm',
  mutate: ['src/**/*.{js,mjs}'],
  mutator: 'javascript',
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.mjs',
  },
  reporters: ['progress', 'html'],
  htmlReporter: {
    baseDir: 'mutation-report',
  },
  coverageAnalysis: 'off',
  ignorePatterns: ['**/test/**', 'coverage/**', 'node_modules/**'],
};
