/** C# rule pack: TP + TN + edge per rule, plus whole-file fixture checks. */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { test, runRule } from './harness';
import {
  noNullForgivingRule,
  sqlStringConcatRule,
  asyncVoidRule,
  consoleWriteLineRule,
  emptyCatchRule
} from '../src/rules/csharp/index';

const has = (ds: { ruleId: string }[], id: string) => ds.some((d) => d.ruleId === id);

// Tests run from compiled dist-test/test which has NO copied fixtures — resolve from the SOURCE tree.
const fixture = (name: string): string => {
  const candidates = [
    path.join(__dirname, 'fixtures', 'csharp', name),
    path.resolve(__dirname, '..', '..', 'test', 'fixtures', 'csharp', name),
    path.resolve(__dirname, '..', '..', '..', 'test', 'fixtures', 'csharp', name)
  ];
  for (const c of candidates) if (fs.existsSync(c)) return fs.readFileSync(c, 'utf8');
  return fs.readFileSync(candidates[0], 'utf8');
};

// ---------------------------------------------------------------------------
// IED-T009 no-null-forgiving
// ---------------------------------------------------------------------------
test('IED-T009 flags null-forgiving x!', async () => {
  const ds = await runRule(noNullForgivingRule, 'csharp', 'class C { void M(string? s){ var x = s!; } }');
  assert.ok(has(ds, 'IED-T009'));
});

test('IED-T009 silent without null-forgiving', async () => {
  const ds = await runRule(noNullForgivingRule, 'csharp', 'class C { void M(string s){ var x = s; } }');
  assert.ok(!has(ds, 'IED-T009'));
});

test('IED-T009 edge: member-access null-forgiving obj.Prop!', async () => {
  const ds = await runRule(noNullForgivingRule, 'csharp', 'class C { void M(A a){ var x = a.Prop!; } }');
  assert.ok(has(ds, 'IED-T009'));
});

test('IED-T009 edge: logical-not is not flagged', async () => {
  const ds = await runRule(noNullForgivingRule, 'csharp', 'class C { void M(bool b){ var x = !b; } }');
  assert.ok(!has(ds, 'IED-T009'));
});

// ---------------------------------------------------------------------------
// IED-S019 sql-string-concat
// ---------------------------------------------------------------------------
test('IED-S019 flags SQL concat with variable', async () => {
  const ds = await runRule(
    sqlStringConcatRule,
    'csharp',
    'class C { void M(string id){ var q = "SELECT * FROM t WHERE id=" + id; } }'
  );
  assert.ok(has(ds, 'IED-S019'));
});

test('IED-S019 flags interpolated SQL with a variable', async () => {
  const ds = await runRule(
    sqlStringConcatRule,
    'csharp',
    'class C { void M(string id){ var q = $"SELECT * FROM t WHERE id={id}"; } }'
  );
  assert.ok(has(ds, 'IED-S019'));
});

test('IED-S019 silent for non-SQL concat', async () => {
  const ds = await runRule(
    sqlStringConcatRule,
    'csharp',
    'class C { void M(string name){ var s = "hello " + name; } }'
  );
  assert.ok(!has(ds, 'IED-S019'));
});

test('IED-S019 edge: interpolated SQL with no interpolation is safe', async () => {
  const ds = await runRule(
    sqlStringConcatRule,
    'csharp',
    'class C { void M(){ var q = $"SELECT * FROM t WHERE id=1"; } }'
  );
  assert.ok(!has(ds, 'IED-S019'));
});

// ---------------------------------------------------------------------------
// IED-C013 async-void
// ---------------------------------------------------------------------------
test('IED-C013 flags async void method', async () => {
  const ds = await runRule(asyncVoidRule, 'csharp', 'class C { public async void M(){ } }');
  assert.ok(has(ds, 'IED-C013'));
});

test('IED-C013 silent for async Task method', async () => {
  const ds = await runRule(asyncVoidRule, 'csharp', 'class C { public async Task M(){ } }');
  assert.ok(!has(ds, 'IED-C013'));
});

test('IED-C013 edge: plain (non-async) void method is fine', async () => {
  const ds = await runRule(asyncVoidRule, 'csharp', 'class C { public void M(){ } }');
  assert.ok(!has(ds, 'IED-C013'));
});

// ---------------------------------------------------------------------------
// IED-Q017 console-writeline
// ---------------------------------------------------------------------------
test('IED-Q017 flags Console.WriteLine', async () => {
  const ds = await runRule(consoleWriteLineRule, 'csharp', 'class C { void M(){ Console.WriteLine("hi"); } }');
  assert.ok(has(ds, 'IED-Q017'));
});

test('IED-Q017 silent for a logger call', async () => {
  const ds = await runRule(consoleWriteLineRule, 'csharp', 'class C { void M(){ logger.WriteLine("hi"); } }');
  assert.ok(!has(ds, 'IED-Q017'));
});

test('IED-Q017 edge: relaxed in test files', async () => {
  const ds = await runRule(
    consoleWriteLineRule,
    'csharp',
    'class C { void M(){ Console.WriteLine("hi"); } }',
    { isTestFile: true }
  );
  assert.ok(!has(ds, 'IED-Q017'));
});

// ---------------------------------------------------------------------------
// IED-L019 empty-catch
// ---------------------------------------------------------------------------
test('IED-L019 flags empty catch block', async () => {
  const ds = await runRule(
    emptyCatchRule,
    'csharp',
    'class C { void M(){ try { Foo(); } catch (Exception e) { } } }'
  );
  assert.ok(has(ds, 'IED-L019'));
});

test('IED-L019 silent when catch handles the exception', async () => {
  const ds = await runRule(
    emptyCatchRule,
    'csharp',
    'class C { void M(){ try { Foo(); } catch (Exception e) { Log(e); } } }'
  );
  assert.ok(!has(ds, 'IED-L019'));
});

test('IED-L019 edge: bare catch with no type but a body is fine', async () => {
  const ds = await runRule(
    emptyCatchRule,
    'csharp',
    'class C { void M(){ try { Foo(); } catch { Bar(); } } }'
  );
  assert.ok(!has(ds, 'IED-L019'));
});

// ---------------------------------------------------------------------------
// Whole-file fixture checks
// ---------------------------------------------------------------------------
test('bad.cs triggers every C# rule', async () => {
  const code = fixture('bad.cs');
  const rules = [
    { rule: noNullForgivingRule, id: 'IED-T009' },
    { rule: sqlStringConcatRule, id: 'IED-S019' },
    { rule: asyncVoidRule, id: 'IED-C013' },
    { rule: consoleWriteLineRule, id: 'IED-Q017' },
    { rule: emptyCatchRule, id: 'IED-L019' }
  ];
  for (const { rule, id } of rules) {
    const ds = await runRule(rule, 'csharp', code);
    assert.ok(has(ds, id), `expected ${id} in bad.cs`);
  }
});

test('good.cs triggers no C# rule', async () => {
  const code = fixture('good.cs');
  const rules = [noNullForgivingRule, sqlStringConcatRule, asyncVoidRule, consoleWriteLineRule, emptyCatchRule];
  for (const rule of rules) {
    const ds = await runRule(rule, 'csharp', code);
    assert.strictEqual(ds.length, 0, `expected no findings from ${rule.id} in good.cs, got ${ds.map((d) => d.ruleId).join(',')}`);
  }
});
