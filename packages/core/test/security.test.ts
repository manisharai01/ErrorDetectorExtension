/**
 * Tests for the security rules (IED-S001..IED-S005). Each rule gets a
 * true-positive and a true-negative, plus edge cases where useful.
 */

import * as assert from 'assert';
import { test, runRule } from './harness';
import { hardcodedSecretsRule } from '../src/rules/security/hardcoded-secrets';
import { evalUsageRule } from '../src/rules/security/eval-usage';
import { innerHtmlRule } from '../src/rules/security/inner-html';
import { commandInjectionRule } from '../src/rules/security/command-injection';
import { taintTrackingRule } from '../src/rules/security/taint-tracking';

// ── IED-S001 hardcoded-secrets ───────────────────────────────────────────────

test('IED-S001 flags an AWS access key id', async () => {
  const found = await runRule(
    hardcodedSecretsRule,
    'javascript',
    'const key = "AKIAIOSFODNN7EXAMPLE12";'
  );
  assert.ok(found.some((d) => d.ruleId === 'IED-S001'));
});

test('IED-S001 flags a GitHub token', async () => {
  const code = 'const t = "ghp_1234567890abcdefghijklmnopqrstuvwxyzAB";';
  const found = await runRule(hardcodedSecretsRule, 'typescript', code);
  assert.ok(found.some((d) => d.ruleId === 'IED-S001'));
});

test('IED-S001 flags an OpenAI key in a template string', async () => {
  const code = 'const t = `sk-abcdefghijklmnopqrstuvwxyz0123`;';
  const found = await runRule(hardcodedSecretsRule, 'javascript', code);
  assert.ok(found.some((d) => d.ruleId === 'IED-S001'));
});

test('IED-S001 ignores an ordinary string', async () => {
  const found = await runRule(hardcodedSecretsRule, 'javascript', 'const greeting = "hello world";');
  assert.equal(found.filter((d) => d.ruleId === 'IED-S001').length, 0);
});

// ── IED-S002 eval-usage ──────────────────────────────────────────────────────

test('IED-S002 flags eval()', async () => {
  const found = await runRule(evalUsageRule, 'javascript', 'eval("1 + 1");');
  assert.ok(found.some((d) => d.ruleId === 'IED-S002'));
});

test('IED-S002 flags new Function()', async () => {
  const found = await runRule(evalUsageRule, 'javascript', 'const f = new Function("return 1");');
  assert.ok(found.some((d) => d.ruleId === 'IED-S002'));
});

test('IED-S002 ignores a normal call', async () => {
  const found = await runRule(evalUsageRule, 'javascript', 'parseInt("10", 10);');
  assert.equal(found.filter((d) => d.ruleId === 'IED-S002').length, 0);
});

// ── IED-S003 inner-html ──────────────────────────────────────────────────────

test('IED-S003 flags innerHTML assignment', async () => {
  const found = await runRule(innerHtmlRule, 'javascript', 'el.innerHTML = userInput;');
  assert.ok(found.some((d) => d.ruleId === 'IED-S003'));
});

test('IED-S003 flags outerHTML assignment', async () => {
  const found = await runRule(innerHtmlRule, 'javascript', 'node.outerHTML = html;');
  assert.ok(found.some((d) => d.ruleId === 'IED-S003'));
});

test('IED-S003 is relaxed when DOMPurify is in scope', async () => {
  const code = 'el.innerHTML = DOMPurify.sanitize(userInput);';
  const found = await runRule(innerHtmlRule, 'javascript', code);
  assert.equal(found.filter((d) => d.ruleId === 'IED-S003').length, 0);
});

test('IED-S003 ignores other property assignments', async () => {
  const found = await runRule(innerHtmlRule, 'javascript', 'el.className = "active";');
  assert.equal(found.filter((d) => d.ruleId === 'IED-S003').length, 0);
});

// ── IED-S004 command-injection ───────────────────────────────────────────────

test('IED-S004 flags exec with a template string', async () => {
  const found = await runRule(commandInjectionRule, 'javascript', 'exec(`rm -rf ${dir}`);');
  assert.ok(found.some((d) => d.ruleId === 'IED-S004'));
});

test('IED-S004 flags exec with string concatenation', async () => {
  const found = await runRule(commandInjectionRule, 'javascript', 'cp.execSync("ls " + dir);');
  assert.ok(found.some((d) => d.ruleId === 'IED-S004'));
});

test('IED-S004 ignores exec with a constant string', async () => {
  const found = await runRule(commandInjectionRule, 'javascript', 'exec("ls -la");');
  assert.equal(found.filter((d) => d.ruleId === 'IED-S004').length, 0);
});

test('IED-S004 ignores unrelated calls with dynamic strings', async () => {
  const found = await runRule(commandInjectionRule, 'javascript', 'logger.info(`hello ${name}`);');
  assert.equal(found.filter((d) => d.ruleId === 'IED-S004').length, 0);
});

// ── IED-S005 taint-tracking ──────────────────────────────────────────────────

test('IED-S005 flags req.query flowing into a SQL query', async () => {
  const code = [
    'const id = req.query.id;',
    'db.query("SELECT * FROM users WHERE id = " + id);'
  ].join('\n');
  const found = await runRule(taintTrackingRule, 'javascript', code);
  assert.ok(found.some((d) => d.ruleId === 'IED-S005'));
});

test('IED-S005 flags tainted value flowing into eval', async () => {
  const code = ['const cmd = process.argv[2];', 'eval(cmd);'].join('\n');
  const found = await runRule(taintTrackingRule, 'javascript', code);
  assert.ok(found.some((d) => d.ruleId === 'IED-S005'));
});

test('IED-S005 follows one-hop propagation into innerHTML', async () => {
  const code = [
    'const raw = location.search;',
    'const html = raw;',
    'el.innerHTML = html;'
  ].join('\n');
  const found = await runRule(taintTrackingRule, 'javascript', code);
  assert.ok(found.some((d) => d.ruleId === 'IED-S005'));
});

test('IED-S005 ignores non-tainted data reaching a sink', async () => {
  const code = ['const id = 42;', 'db.query("SELECT * FROM users WHERE id = " + id);'].join('\n');
  const found = await runRule(taintTrackingRule, 'javascript', code);
  assert.equal(found.filter((d) => d.ruleId === 'IED-S005').length, 0);
});
