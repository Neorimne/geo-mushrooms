import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/out-tsc'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            // Layering. `util` is the floor: framework-free, or near it, and
            // depended on by everything. `ui` is presentational and may not
            // reach the data layer; `data-access` may not reach back up into
            // `ui`. Both of those were violated before these rules existed.
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: [
                'type:feature',
                'type:ui',
                'type:data-access',
                'type:util',
              ],
            },
            {
              sourceTag: 'type:feature',
              onlyDependOnLibsWithTags: [
                'type:feature',
                'type:ui',
                'type:data-access',
                'type:util',
              ],
            },
            {
              sourceTag: 'type:ui',
              onlyDependOnLibsWithTags: ['type:ui', 'type:util'],
            },
            {
              sourceTag: 'type:data-access',
              onlyDependOnLibsWithTags: ['type:data-access', 'type:util'],
            },
            {
              sourceTag: 'type:util',
              onlyDependOnLibsWithTags: ['type:util'],
            },

            // The e2e suites depend on no library code at all. `client-e2e`
            // mocks the API it tests, so sharing code with the app would let
            // the test and the code agree by construction rather than by
            // working — `apps/client-e2e/src/support/mocks.ts` says so, and
            // this is what makes the claim enforceable.
            {
              sourceTag: 'type:e2e',
              onlyDependOnLibsWithTags: [],
            },

            // Scopes. The Nest app may touch shared, framework-free libraries
            // and nothing else: this is what stops `apps/api` being wired to an
            // Angular library because one constant happened to live there.
            {
              sourceTag: 'scope:api',
              onlyDependOnLibsWithTags: ['scope:api', 'scope:shared'],
            },
            {
              sourceTag: 'scope:client',
              onlyDependOnLibsWithTags: [
                'scope:client',
                'scope:catalog',
                'scope:auth',
                'scope:shared',
              ],
            },
            {
              sourceTag: 'scope:shared',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
            {
              sourceTag: 'scope:auth',
              onlyDependOnLibsWithTags: ['scope:auth', 'scope:shared'],
            },

            // catalog -> auth is deliberate, not an oversight: the list header
            // owns the logout control, and both feature libraries read
            // `AuthStore` to decide what an unauthenticated view shows.
            {
              sourceTag: 'scope:catalog',
              onlyDependOnLibsWithTags: [
                'scope:catalog',
                'scope:auth',
                'scope:shared',
              ],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {},
  },
];
