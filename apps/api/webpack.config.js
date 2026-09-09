const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

// webpack-cli 7 removed the `--node-env` flag, so mode is passed via `--mode`.
// Read it from argv instead of process.env.NODE_ENV.
module.exports = (env, argv) => ({
  output: {
    path: join(__dirname, '../../dist/apps/api'),
    clean: true,
    ...(argv.mode !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
      sourceMap: true,
    }),
  ],
});
