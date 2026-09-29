import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // The provider seam. The run, the services and the controllers depend on
    // `ArchiveProvider` and never on an adapter, so a second source is a second
    // adapter rather than a second run loop. Prose cannot be linted, but the
    // imports can. Exactly two files may reach into `sources/`:
    //
    // - `ingestion.module.ts`, whose `useClass` line chooses the adapter;
    // - `seed/demo-data.ts`, because the demo dataset *is* the synthetic
    //   source's output — invented towns no other source knows. The file says
    //   so where it imports.
    files: ['src/**/*.ts', 'prisma/**/*.ts'],
    ignores: [
      'src/ingestion/sources/**',
      'src/ingestion/ingestion.module.ts',
      'src/seed/demo-data.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)sources/',
              message:
                'Only ingestion.module.ts and the demo seed may name an archive source. Depend on ArchiveProvider instead — see "The provider seam" in CLAUDE.md.',
            },
          ],
        },
      ],
    },
  },
];
