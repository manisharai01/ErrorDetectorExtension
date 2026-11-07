/**
 * Flow / heuristics rules ported from the legacy engine (missing-await,
 * null-deref, inconsistent-return, inconsistent-usage), the quick fixes, and
 * the single-pass node index the engine now runs every rule on.
 */
import * as assert from 'assert';
import { test, runRule, parser } from './harness';
import { missingAwaitRule } from '../src/rules/logic/missing-await';
import { nullDerefRule } from '../src/rules/logic/null-deref';
import { inconsistentReturnRule } from '../src/rules/logic/inconsistent-return';
import { inconsistentUsageRule } from '../src/rules/heuristics/inconsistent-usage';
import { unusedParametersRule } from '../src/rules/code-smells/unused-parameters';
import { promiseSwallowingRule } from '../src/rules/logic/promise-swallowing';
import { duplicateCodeRule } from '../src/rules/code-smells/duplicate-code';
import { NodeIndex } from '../src/engine/node-index';
import { Analyzer } from '../src/engine/analyzer';
import { defaultResolvedConfig } from '../src/config/resolve';
import { registerAllRules } from '../src/rules/index';
import { Severity, type Diagnostic, type Rule } from '../src/rules/types';

const ids = <T extends { ruleId: string }>(ds: T[], id: string): T[] => ds.filter((d) => d.ruleId === id);

/** Apply a rule's quick fix for `d` to `code`. */
function applyFix(rule: Rule, d: Diagnostic, code: string): string | null {
  const edits = rule.fix?.(d, code);
  if (!edits) return null;
  let out = code;
  for (const e of [...edits].sort((a, b) => b.startIndex - a.startIndex)) {
    out = out.slice(0, e.startIndex) + e.newText + out.slice(e.endIndex);
  }
  return out;
}

// ── IED-L021 missing-await ──────────────────────────────────────────────────
test('IED-L021 flags an un-awaited same-file async call, with an "await" fix', async () => {
  const code = [
    'async function save(u) { await db.put(u); }',
    'async function onSubmit(u) {',
    '  save(u);',
    '  toast("saved");',
    '}'
  ].join('\n');
  const ds = ids(await runRule(missingAwaitRule, 'javascript', code), 'IED-L021');
  assert.strictEqual(ds.length, 1);
  assert.ok(applyFix(missingAwaitRule, ds[0], code)!.includes('  await save(u);'));
});

test('IED-L021 flags a dropped promise inside .then(), with a "return" fix', async () => {
  const code = 'const save = async (u) => db.put(u);\nload().then(() => {\n  save(user);\n});\n';
  const ds = ids(await runRule(missingAwaitRule, 'javascript', code), 'IED-L021');
  assert.strictEqual(ds.length, 1);
  assert.ok(applyFix(missingAwaitRule, ds[0], code)!.includes('  return save(user);'));
});

test('IED-L021 ignores awaited, returned, voided, chained and sync-context calls', async () => {
  const code = [
    'class Svc {',
    '  async save() {}',
    '  async run() { await this.save(); void this.save(); this.save().catch(log); return this.save(); }',
    '  sync() { this.save(); }',
    '}',
    'async function loadAsync() {}',
    'async function go() { loadAsync(); }'
  ].join('\n');
  const ds = ids(await runRule(missingAwaitRule, 'javascript', code), 'IED-L021');
  assert.strictEqual(ds.length, 0, JSON.stringify(ds.map((d) => d.message)));
});

// ── IED-L022 null-deref ─────────────────────────────────────────────────────
test('IED-L022 flags dereferencing find()/querySelector()/match() results', async () => {
  const code = [
    'function a(users, id) { const u = users.find((x) => x.id === id); return u.name; }',
    'function b() { const el = document.querySelector("#save"); el.addEventListener("click", go); }',
    'function c(s) { const m = s.match(/(\\d+)/); return m[1]; }',
    'function d() { let total; total.push(1); }',
    'function e(cache, k) { const { data } = cache.get(k); return data; }'
  ].join('\n');
  const ds = ids(await runRule(nullDerefRule, 'javascript', code), 'IED-L022');
  assert.deepStrictEqual(
    ds.map((d) => d.range.start.row),
    [0, 1, 2, 3, 4],
    JSON.stringify(ds.map((d) => d.message))
  );
});

test('IED-L022 flags a TypeScript optional parameter used without a check', async () => {
  const code = 'function f(opts?: Options) {\n  return opts.timeout;\n}\n';
  assert.strictEqual(ids(await runRule(nullDerefRule, 'typescript', code), 'IED-L022').length, 1);
});

test('IED-L022 stays quiet when the value is checked, defaulted, chained or handed off', async () => {
  const code = [
    'function a(users) { const u = users.find(f); if (!u) return null; return u.name; }',
    'function b(users) { const u = users.find(f); return u?.name; }',
    'function c(users) { const u = users.find(f) ?? guest; return u.name; }',
    'function d(users) { const u = users.find(f); send({ u }); return u.name; }',
    'function e() { let x; x = make(); return x.y; }',
    'function g() { const el = document.querySelector("#a"); onReady(() => el.focus()); }',
    'function h(o) { const v = o.items.find(f)!; return v.id; }'
  ].join('\n');
  const ds = ids(await runRule(nullDerefRule, 'typescript', code), 'IED-L022');
  assert.strictEqual(ds.length, 0, JSON.stringify(ds.map((d) => d.message)));
});

// ── IED-L023 inconsistent-return ────────────────────────────────────────────
test('IED-L023 flags value + bare returns, mixed literal kinds and disjoint shapes', async () => {
  const code = [
    'function parse(s) { if (!s) return; return JSON.parse(s); }',
    'function code(ok) { if (ok) return "fine"; return 0; }',
    'function load(id) { if (hit(id)) return { data: 1 }; return { error: "miss" }; }'
  ].join('\n');
  const ds = ids(await runRule(inconsistentReturnRule, 'javascript', code), 'IED-L023');
  assert.deepStrictEqual(ds.map((d) => d.data?.kind), ['missing-value', 'mixed-types', 'mixed-shapes']);
  assert.strictEqual(ds[2].severity, Severity.Info);
});

test('IED-L023 allows discriminated results, useEffect cleanups, null for "none" and nested functions', async () => {
  const code = [
    'function a(x) { if (x) return { ok: true, data: x }; return { ok: false, error: "no" }; }',
    'useEffect(() => { if (!on) return; const t = start(); return () => stop(t); }, [on]);',
    'function b(xs) { if (!xs.length) return null; return xs[0]; }',
    'function c(xs) { xs.forEach((x) => { if (!x) return; use(x); }); return xs.length; }'
  ].join('\n');
  const ds = ids(await runRule(inconsistentReturnRule, 'javascript', code), 'IED-L023');
  assert.strictEqual(ds.length, 0, JSON.stringify(ds.map((d) => d.message)));
});

// ── IED-H003 inconsistent-usage ─────────────────────────────────────────────
test('IED-H003 flags a variable used as both array and object', async () => {
  const code = 'function render(data) {\n  const total = data.total;\n  return data.map(row);\n}\n';
  const ds = ids(await runRule(inconsistentUsageRule, 'javascript', code), 'IED-H003');
  assert.strictEqual(ds.length, 1);
  assert.strictEqual(ds[0].range.start.row, 1);
});

test('IED-H003 ignores arrays with length, libraries and separate functions', async () => {
  const code = [
    'function a(xs) { if (xs.length) return xs.map(f); return xs.slice(1); }',
    'function b() { return _.map(list, f) && _.VERSION; }',
    'function c(res) { return res.items; }',
    'function d(res) { return res.map(f); }'
  ].join('\n');
  const ds = ids(await runRule(inconsistentUsageRule, 'javascript', code), 'IED-H003');
  assert.strictEqual(ds.length, 0, JSON.stringify(ds.map((d) => d.message)));
});

// ── Quick fixes on existing rules ───────────────────────────────────────────
test('IED-Q006 quick fix prefixes the unused parameter with "_"', async () => {
  const code = 'function f(a, b) { return a; }\n';
  const [d] = ids(await runRule(unusedParametersRule, 'javascript', code), 'IED-Q006');
  assert.strictEqual(applyFix(unusedParametersRule, d, code), 'function f(a, _b) { return a; }\n');
});

test('IED-Q006 skips TS parameter properties and params read by other defaults', async () => {
  const code = 'class A { constructor(private svc: Svc, readonly cfg: Cfg) {} }\nfunction g(a, b = a) { return b; }\n';
  assert.strictEqual(ids(await runRule(unusedParametersRule, 'typescript', code), 'IED-Q006').length, 0);
});

test('IED-L002 offers "await" only inside an async function', async () => {
  const code = 'async function a() {\n  loadAsync();\n}\nfunction b() {\n  loadAsync();\n}\n';
  const ds = ids(await runRule(promiseSwallowingRule, 'javascript', code), 'IED-L002');
  assert.strictEqual(ds.length, 2);
  assert.ok(applyFix(promiseSwallowingRule, ds[0], code)!.includes('  await loadAsync();'));
  assert.strictEqual(applyFix(promiseSwallowingRule, ds[1], code), null);
});

// ── Engine: single-pass node index & config severity ───────────────────────
test('duplicate-code (IED-Q007) now works beyond JS — Python copy with renamed variables', async () => {
  const fn = (name: string, v: string) =>
    `def ${name}(${v}):\n    total = 0\n    for item in ${v}:\n        if item.price > 0:\n            total += item.price * item.qty\n    return total\n`;
  const ds = await runRule(duplicateCodeRule, 'python', fn('sum_a', 'rows') + '\n' + fn('sum_b', 'lines'));
  assert.strictEqual(ids(ds, 'IED-Q007').length, 1);
});

test('NodeIndex serves declared and undeclared types in document order', async () => {
  const { tree } = await parser().parse('javascript', 'if (a) { b(); if (c) { d(); } }\ne();\n');
  const index = new NodeIndex(tree.rootNode, ['call_expression']);
  assert.deepStrictEqual(index.get('call_expression').map((n) => n.text), ['b()', 'd()', 'e()']);
  assert.deepStrictEqual(
    index.get(['if_statement', 'call_expression']).map((n) => n.type),
    ['if_statement', 'call_expression', 'if_statement', 'call_expression', 'call_expression']
  );
});

test('A configured severity overrides the severity a rule reports', async () => {
  registerAllRules();
  const config = defaultResolvedConfig(process.cwd());
  config.ruleSeverities.set('IED-Q005', Severity.Error); // todo-without-issue reports Info itself
  const analyzer = new Analyzer(config);
  const r = await analyzer.analyzeFile({ filePath: 'x.js', content: '// TODO tidy this\n' });
  analyzer.dispose();
  assert.strictEqual(r.diagnostics.find((d) => d.ruleId === 'IED-Q005')?.severity, Severity.Error);
});
