/**
 * The message global setup leaves for global teardown. Declared on `globalThis`
 * rather than as a bare `var` in the setup module: the two run in the same
 * process but not the same module scope, so `globalThis` is the only channel
 * between them, and only a global declaration makes it typed at both ends.
 */
declare global {
  // eslint-disable-next-line no-var
  var __TEARDOWN_MESSAGE__: string;
}

export {};
