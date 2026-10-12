const nxPreset = require('@nx/jest/preset').default;

module.exports = {
  ...nxPreset,
  // Jest only counts files a spec happens to load, so an untested file would
  // raise the percentage by being invisible. Count every source file instead.
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!<rootDir>/src/**/*.spec.ts',
    '!<rootDir>/src/test-setup.ts',
    '!<rootDir>/src/index.ts',
  ],
  // html for the CI artifact; text-summary so the numbers show in the log.
  coverageReporters: ['html', 'text-summary'],
  // No threshold here: projects range from 3% to 100% branch coverage, so any
  // shared floor would mean nothing. Each jest.config.cts sets its own, just
  // under what it measured. Raise it when coverage rises; never lower it to pass.
};
