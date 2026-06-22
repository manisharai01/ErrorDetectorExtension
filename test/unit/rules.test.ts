/**
 * Lightweight rule unit tests. Runs without VS Code by importing the
 * inline runner directly. Invoke via `node out/test/unit/rules.test.js`
 * after `npm run compile`.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';
import { runAnalysisInline } from '../../src/workers/inline-runner';

function analyze(file: string) {
  // __dirname is out/test/unit; fixtures live in repo's test/fixtures.
  const full = path.join(__dirname, '..', '..', '..', 'test', 'fixtures', file);
  const src = fs.readFileSync(full, 'utf8');
  return runAnalysisInline({
    id: 0, filePath: full, sourceText: src,
    language: file.endsWith('.tsx') ? 'tsx' : file.endsWith('.ts') ? 'ts' : 'js',
    isTestFile: false, ruleSeverities: {}, options: { anyTypeThreshold: 5, allowConsoleInCli: true }
  });
}

const cases: { name: string; check: () => void }[] = [
  {
    name: 'flags console.log but not console.warn',
    check: () => {
      const issues = analyze('console-log.js').filter(i => i.ruleId === 'smell/console-log');
      assert.strictEqual(issues.length, 1, `expected 1 console.log issue, got ${issues.length}`);
    }
  },
  {
    name: 'flags <= length and arr[arr.length]',
    check: () => {
      const issues = analyze('array-index.js').filter(i => i.ruleId === 'logic/array-index');
      assert.ok(issues.length >= 2, `expected >= 2 array-index issues, got ${issues.length}`);
    }
  },
  {
    name: 'flags AWS key, GH token, eval, innerHTML',
    check: () => {
      const issues = analyze('security.js');
      const ids = new Set(issues.map(i => i.ruleId));
      assert.ok(ids.has('security/hardcoded-secrets'), 'missing secrets finding');
      assert.ok(ids.has('security/eval-usage'),        'missing eval finding');
      assert.ok(ids.has('security/inner-html'),        'missing innerHTML finding');
    }
  }
];

let failed = 0;
for (const t of cases) {
  try { t.check(); console.log(`ok   ${t.name}`); }
  catch (e) { failed++; console.error(`FAIL ${t.name}: ${(e as Error).message}`); }
}
if (failed) { console.error(`${failed} test(s) failed`); process.exit(1); }
console.log(`${cases.length} test(s) passed.`);
