import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // The provider seam. The run, the services and the controllers depend on
    // `ArchiveProvider` and never on an adapter, so a second source is a second
    // adapter rather than a second run loop. Choosing the adapter is the one
    // `useClass` line in `ingestion.module.ts`; nothing else may reach into
    // `sources/`. Prose cannot be linted, but the imports can.
    files: ['src/**/*.ts', 'prisma/**/*.ts'],
    ignores: ['src/ingestion/sources/**', 'src/ingestion/ingestion.module.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)sources/',
              message:
                'Only ingestion.module.ts may name an archive source. Depend on ArchiveProvider instead — see "The provider seam" in CLAUDE.md.',
            },
          ],
        },
      ],
    },
  },
];
