module.exports = {
  displayName: 'api',
  preset: '../../jest.preset.js',
  coverageDirectory: '../../coverage/apps/api',
  coverageThreshold: {
    global: { statements: 86, branches: 74, functions: 84, lines: 85 },
  },
};
