/**
 * Smoke integration test (no @vscode/test-electron dependency assumed):
 * just sanity-checks that registering the rules and analysing a sample
 * works end-to-end without throwing.
 */
import * as assert from 'assert';
import { registerAllRules } from '../../src/rules';
import { registry } from '../../src/rules-engine/registry';
import { runAnalysisInline } from '../../src/workers/inline-runner';

registerAllRules();
assert.ok(registry.all().length >= 20, `expected >=20 rules, got ${registry.all().length}`);

const issues = runAnalysisInline({
  id: 0, filePath: '/tmp/x.ts',
  sourceText: 'const a: any = 1; console.log(a);',
  language: 'ts', isTestFile: false, ruleSeverities: {}, options: { anyTypeThreshold: 5, allowConsoleInCli: true }
});
assert.ok(issues.some(i => i.ruleId === 'smell/console-log'));
console.log(`integration ok — ${registry.all().length} rules, ${issues.length} issues on sample.`);
