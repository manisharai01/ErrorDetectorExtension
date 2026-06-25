import * as assert from 'assert';
import { test, runRule } from './harness';
import { arrayIndexRule } from '../src/rules/logic/array-index';
import { infiniteLoopRule } from '../src/rules/logic/infinite-loop';
import { recursionBaseCaseRule } from '../src/rules/logic/recursion-base-case';
import { typeGuardContradictionRule } from '../src/rules/logic/type-guard-contradiction';

// ---------------------------------------------------------------------------
// IED-L001 — array-index
// ---------------------------------------------------------------------------
test('IED-L001 flags arr[arr.length]', async () => {
  const found = await runRule(arrayIndexRule, 'javascript', 'let v = arr[arr.length];');
  assert.ok(found.some((d) => d.ruleId === 'IED-L001'));
});

test('IED-L001 flags a `<= .length` for loop bound', async () => {
  const found = await runRule(
    arrayIndexRule,
    'javascript',
    'for (let i = 0; i <= arr.length; i++) { use(arr[i]); }'
  );
  assert.ok(found.some((d) => d.ruleId === 'IED-L001'));
});

test('IED-L001 ignores arr[i] and a different array length', async () => {
  const found = await runRule(
    arrayIndexRule,
    'javascript',
    'let v = arr[i]; let w = other[arr.length];'
  );
  assert.equal(found.filter((d) => d.ruleId === 'IED-L001').length, 0);
});

test('IED-L001 ignores a correct `< .length` for loop', async () => {
  const found = await runRule(
    arrayIndexRule,
    'javascript',
    'for (let i = 0; i < arr.length; i++) { use(arr[i]); }'
  );
  assert.equal(found.filter((d) => d.ruleId === 'IED-L001').length, 0);
});

// ---------------------------------------------------------------------------
// IED-L005 — infinite-loop
// ---------------------------------------------------------------------------
test('IED-L005 flags while (true) without an exit', async () => {
  const found = await runRule(infiniteLoopRule, 'javascript', 'while (true) { doStuff(); }');
  assert.ok(found.some((d) => d.ruleId === 'IED-L005'));
});

test('IED-L005 flags for (;;) without an exit', async () => {
  const found = await runRule(infiniteLoopRule, 'javascript', 'for (;;) { doStuff(); }');
  assert.ok(found.some((d) => d.ruleId === 'IED-L005'));
});

test('IED-L005 ignores while (true) that breaks', async () => {
  const found = await runRule(
    infiniteLoopRule,
    'javascript',
    'while (true) { if (done) break; tick(); }'
  );
  assert.equal(found.filter((d) => d.ruleId === 'IED-L005').length, 0);
});

test('IED-L005 ignores for (;;) that returns', async () => {
  const found = await runRule(
    infiniteLoopRule,
    'javascript',
    'function f() { for (;;) { if (done) return 1; } }'
  );
  assert.equal(found.filter((d) => d.ruleId === 'IED-L005').length, 0);
});

test('IED-L005 ignores a normal while loop', async () => {
  const found = await runRule(infiniteLoopRule, 'javascript', 'while (i < n) { i++; }');
  assert.equal(found.filter((d) => d.ruleId === 'IED-L005').length, 0);
});

// ---------------------------------------------------------------------------
// IED-L006 — recursion-base-case
// ---------------------------------------------------------------------------
test('IED-L006 flags self-recursion with no guard', async () => {
  const found = await runRule(
    recursionBaseCaseRule,
    'javascript',
    'function f() { return f() + 1; }'
  );
  assert.ok(found.some((d) => d.ruleId === 'IED-L006'));
});

test('IED-L006 ignores recursion guarded by an if', async () => {
  const found = await runRule(
    recursionBaseCaseRule,
    'javascript',
    'function g(n) { if (n <= 0) return 0; return g(n - 1); }'
  );
  assert.equal(found.filter((d) => d.ruleId === 'IED-L006').length, 0);
});

test('IED-L006 ignores a non-recursive function', async () => {
  const found = await runRule(
    recursionBaseCaseRule,
    'javascript',
    'function h(n) { return n + 1; }'
  );
  assert.equal(found.filter((d) => d.ruleId === 'IED-L006').length, 0);
});

// ---------------------------------------------------------------------------
// IED-L007 — type-guard-contradiction
// ---------------------------------------------------------------------------
test('IED-L007 flags contradictory typeof && typeof', async () => {
  const found = await runRule(
    typeGuardContradictionRule,
    'typescript',
    'const b = typeof x === "string" && typeof x === "number";'
  );
  assert.ok(found.some((d) => d.ruleId === 'IED-L007'));
});

test('IED-L007 ignores typeof checks on different variables', async () => {
  const found = await runRule(
    typeGuardContradictionRule,
    'typescript',
    'const b = typeof x === "string" && typeof y === "number";'
  );
  assert.equal(found.filter((d) => d.ruleId === 'IED-L007').length, 0);
});

test('IED-L007 ignores the same typeof literal twice', async () => {
  const found = await runRule(
    typeGuardContradictionRule,
    'typescript',
    'const b = typeof x === "string" && typeof x === "string";'
  );
  assert.equal(found.filter((d) => d.ruleId === 'IED-L007').length, 0);
});
