/**
 * Cross-file analysis: findUnusedExports. Multi-file, so it uses the helper
 * directly rather than the single-file runRule harness.
 */
import * as assert from 'assert';
import { test } from './harness';
import { findUnusedExports } from '../src/engine/project-graph';

test('findUnusedExports flags an export no file imports', async () => {
  const unused = await findUnusedExports([
    { filePath: 'a.ts', content: 'export function used() {}\nexport function dead() {}' },
    { filePath: 'b.ts', content: 'import { used } from "./a";\nused();' }
  ]);
  assert.deepEqual(unused.map((u) => u.name).sort(), ['dead']);
});

test('findUnusedExports treats a name imported anywhere as used', async () => {
  const unused = await findUnusedExports([
    { filePath: 'a.ts', content: 'export const helper = 1;' },
    { filePath: 'b.ts', content: 'import { helper } from "./a";\nconsole.log(helper);' }
  ]);
  assert.equal(unused.length, 0);
});

test('findUnusedExports honours `export { x as y }` public name + re-exports', async () => {
  const unused = await findUnusedExports([
    { filePath: 'a.ts', content: 'function impl() {}\nexport { impl as publicName };' },
    { filePath: 'b.ts', content: 'export { publicName } from "./a";' }
  ]);
  // publicName is re-exported (used); nothing should be flagged.
  assert.equal(unused.length, 0);
});

test('findUnusedExports ignores Python/Go files (JS/TS only)', async () => {
  const unused = await findUnusedExports([
    { filePath: 'm.py', content: 'def helper():\n    pass' },
    { filePath: 'm.go', content: 'package main\nfunc Helper() {}' }
  ]);
  assert.equal(unused.length, 0);
});
