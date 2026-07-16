/**
 * Wrapper -> entry pairing for main-module detection.
 *
 * The bins in package.json point at hanzo-bot.mjs, which imports the built entry
 * out of dist/. The process therefore carries the WRAPPER in argv[1] while the
 * entry sees itself in import.meta.url, so isMainModule() only treats the entry as
 * main when the pair is listed here. An unlisted wrapper makes every invocation
 * exit 0 with no output.
 *
 * WRAPPERS mirrors the distinct bin targets; ENTRIES mirrors the specifiers
 * hanzo-bot.mjs imports. The pairs are their cross-product, so no row can go
 * missing and none can be duplicated.
 *
 * test/entry-wrapper-pairs.test.ts locks WRAPPERS to the bins package.json declares.
 */

const WRAPPERS = ["hanzo-bot.mjs"] as const;
const ENTRIES = ["entry.js", "entry.mjs"] as const;

export const ENTRY_WRAPPER_PAIRS: ReadonlyArray<{
  wrapperBasename: string;
  entryBasename: string;
}> = WRAPPERS.flatMap((wrapperBasename) =>
  ENTRIES.map((entryBasename) => ({ wrapperBasename, entryBasename })),
);
