/** Ruby rule pack: TP + TN + edge per rule, plus whole-file fixture checks. */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { test, runRule } from './harness';
import {
  sqlInjectionRubyRule,
  evalUsageRubyRule,
  unsafeDeserializationRule,
  debugOutputRubyRule,
  rescueSwallowRule
} from '../src/rules/ruby/index';

const has = (ds: { ruleId: string }[], id: string) => ds.some((d) => d.ruleId === id);
// Tests run from compiled dist-test/test which has NO copied fixtures — resolve from the SOURCE tree.
const fixture = (name: string): string => {
  const candidates = [
    path.join(__dirname, 'fixtures', 'ruby', name),
    path.resolve(__dirname, '..', '..', 'test', 'fixtures', 'ruby', name),
    path.resolve(__dirname, '..', '..', '..', 'test', 'fixtures', 'ruby', name)
  ];
  for (const c of candidates) if (fs.existsSync(c)) return fs.readFileSync(c, 'utf8');
  return fs.readFileSync(candidates[0], 'utf8');
};

// ---------------------------------------------------------------------------
// IED-S020 sql-injection
// ---------------------------------------------------------------------------
test('IED-S020 flags interpolated SQL passed to execute', async () => {
  const ds = await runRule(
    sqlInjectionRubyRule,
    'ruby',
    'db.execute("SELECT * FROM users WHERE id = #{id}")\n'
  );
  assert.ok(has(ds, 'IED-S020'));
});

test('IED-S020 flags interpolated SQL assigned to sql var', async () => {
  const ds = await runRule(
    sqlInjectionRubyRule,
    'ruby',
    'sql = "DELETE FROM t WHERE n = #{name}"\n'
  );
  assert.ok(has(ds, 'IED-S020'));
});

test('IED-S020 silent on parameterized query', async () => {
  const ds = await runRule(
    sqlInjectionRubyRule,
    'ruby',
    'db.execute("SELECT * FROM users WHERE id = ?", [id])\n'
  );
  assert.ok(!has(ds, 'IED-S020'));
});

test('IED-S020 edge: interpolation without SQL keyword is not flagged', async () => {
  const ds = await runRule(
    sqlInjectionRubyRule,
    'ruby',
    'db.execute("greeting #{name}")\n'
  );
  assert.ok(!has(ds, 'IED-S020'));
});

// ---------------------------------------------------------------------------
// IED-S021 eval-usage
// ---------------------------------------------------------------------------
test('IED-S021 flags eval on a variable', async () => {
  const ds = await runRule(evalUsageRubyRule, 'ruby', 'def m(x)\n  eval(x)\nend\n');
  assert.ok(has(ds, 'IED-S021'));
});

test('IED-S021 silent on constant literal eval', async () => {
  const ds = await runRule(evalUsageRubyRule, 'ruby', 'eval("1 + 1")\n');
  assert.ok(!has(ds, 'IED-S021'));
});

test('IED-S021 edge: instance_eval on a variable is flagged', async () => {
  const ds = await runRule(evalUsageRubyRule, 'ruby', 'obj.instance_eval(code)\n');
  assert.ok(has(ds, 'IED-S021'));
});

// ---------------------------------------------------------------------------
// IED-S022 unsafe-deserialization
// ---------------------------------------------------------------------------
test('IED-S022 flags Marshal.load on a variable', async () => {
  const ds = await runRule(unsafeDeserializationRule, 'ruby', 'Marshal.load(data)\n');
  assert.ok(has(ds, 'IED-S022'));
});

test('IED-S022 silent on YAML.load of a literal', async () => {
  const ds = await runRule(unsafeDeserializationRule, 'ruby', 'YAML.load("a: 1")\n');
  assert.ok(!has(ds, 'IED-S022'));
});

test('IED-S022 edge: records the receiver in data', async () => {
  const ds = await runRule(unsafeDeserializationRule, 'ruby', 'YAML.load(input)\n');
  const d = ds.find((x) => x.ruleId === 'IED-S022');
  assert.ok(d);
  assert.strictEqual(d!.data?.receiver, 'YAML');
});

// ---------------------------------------------------------------------------
// IED-Q018 debug-output
// ---------------------------------------------------------------------------
test('IED-Q018 flags puts with an argument', async () => {
  const ds = await runRule(debugOutputRubyRule, 'ruby', 'puts "hi"\n');
  assert.ok(has(ds, 'IED-Q018'));
});

test('IED-Q018 silent in test files', async () => {
  const ds = await runRule(debugOutputRubyRule, 'ruby', 'puts "hi"\n', { isTestFile: true });
  assert.ok(!has(ds, 'IED-Q018'));
});

test('IED-Q018 edge: bare `p` as a variable is not flagged', async () => {
  const ds = await runRule(debugOutputRubyRule, 'ruby', 'p = 42\nputs_result = p\n');
  assert.ok(!has(ds, 'IED-Q018'));
});

// ---------------------------------------------------------------------------
// IED-L020 rescue-swallow
// ---------------------------------------------------------------------------
test('IED-L020 flags an empty rescue', async () => {
  const ds = await runRule(
    rescueSwallowRule,
    'ruby',
    'begin\n  risky\nrescue => e\nend\n'
  );
  assert.ok(has(ds, 'IED-L020'));
});

test('IED-L020 silent when rescue has a body', async () => {
  const ds = await runRule(
    rescueSwallowRule,
    'ruby',
    'begin\n  risky\nrescue => e\n  log(e)\nend\n'
  );
  assert.ok(!has(ds, 'IED-L020'));
});

test('IED-L020 edge: bare rescue with no body is flagged', async () => {
  const ds = await runRule(
    rescueSwallowRule,
    'ruby',
    'begin\n  risky\nrescue\nend\n'
  );
  assert.ok(has(ds, 'IED-L020'));
});

test('IED-L020 edge: comment-only rescue still swallows', async () => {
  const ds = await runRule(
    rescueSwallowRule,
    'ruby',
    'begin\n  risky\nrescue => e\n  # ignore\nend\n'
  );
  assert.ok(has(ds, 'IED-L020'));
});

// ---------------------------------------------------------------------------
// Whole-file fixtures
// ---------------------------------------------------------------------------
test('bad.rb triggers every Ruby rule', async () => {
  const code = fixture('bad.rb');
  const rules = [
    sqlInjectionRubyRule,
    evalUsageRubyRule,
    unsafeDeserializationRule,
    debugOutputRubyRule,
    rescueSwallowRule
  ];
  const all: { ruleId: string }[] = [];
  for (const r of rules) all.push(...(await runRule(r, 'ruby', code)));
  for (const id of ['IED-S020', 'IED-S021', 'IED-S022', 'IED-Q018', 'IED-L020']) {
    assert.ok(has(all, id), `expected ${id} in bad.rb`);
  }
});

test('good.rb triggers no Ruby rules', async () => {
  const code = fixture('good.rb');
  const rules = [
    sqlInjectionRubyRule,
    evalUsageRubyRule,
    unsafeDeserializationRule,
    debugOutputRubyRule,
    rescueSwallowRule
  ];
  const all: { ruleId: string }[] = [];
  for (const r of rules) all.push(...(await runRule(r, 'ruby', code)));
  assert.strictEqual(all.length, 0, `expected no findings, got ${JSON.stringify(all)}`);
});
