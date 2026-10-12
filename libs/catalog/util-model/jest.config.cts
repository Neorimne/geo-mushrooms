module.exports = {
  displayName: 'catalog-util-model',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  coverageDirectory: '../../../coverage/libs/catalog/util-model',
  coverageThreshold: {
    global: { statements: 98, branches: 98, functions: 98, lines: 98 },
  },
};
