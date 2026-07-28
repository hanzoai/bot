// Bot root resolution imports fs through this facade so tests can replace
// filesystem behavior without mocking node:fs globally.
export { default as botRootFsSync } from "node:fs";
export { default as botRootFs } from "node:fs/promises";
