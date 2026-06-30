/**
 * Tests for the data-flow / control-flow rules (the single-file slice of the
 * previously-deferred CFG work): constant-condition, unreachable-code,
 * overwritten-before-use. Each: true positive, true negative, edge case.
 */
import * as assert from 'assert';
import { test, runRule } from './harness';
import { constantConditionRule } from '../src/rules/logic/constant-condition';
import { unreachableCodeRule } from '../src/rules/logic/unreachable-code';
import { overwrittenBeforeUseRule } from '../src/rules/heuristics/overwritten-before-use';

// ── IED-L008 constant-condition ──────────────────────────────────────────────

test('IED-L008 flags if (true)', async () => {
  const f = await runRule(constantConditionRule, 'javascript', 'if (true) { go(); }');
  assert.ok(f.some((d) => d.ruleId === 'IED-L008'));
});

test('IED-L008 flags a literal ternary condition', async () => {
  const f = await runRule(constantConditionRule, 'javascript', 'const x = false ? 1 : 2;');
  assert.ok(f.some((d) => d.ruleId === 'IED-L008'));
});

test('IED-L008 does not flag a real condition', async () => {
  const f = await runRule(constantConditionRule, 'javascript', 'if (x > 0) { go(); }');
  assert.equal(f.length, 0);
});

test('IED-L008 leaves while (true) alone (idiomatic loop)', async () => {
  const f = await runRule(constantConditionRule, 'javascript', 'while (true) { tick(); }');
  assert.equal(f.length, 0);
});

// ── IED-L009 unreachable-code ────────────────────────────────────────────────

test('IED-L009 flags code after return', async () => {
  const f = await runRule(
    unreachableCodeRule,
    'javascript',
    'function f() { return 1; doThing(); }'
  );
  assert.ok(f.some((d) => d.ruleId === 'IED-L009'));
});

test('IED-L009 flags code after throw', async () => {
  const f = await runRule(
    unreachableCodeRule,
    'javascript',
    'function f() { throw new Error("x"); cleanup(); }'
  );
  assert.ok(f.some((d) => d.ruleId === 'IED-L009'));
});

test('IED-L009 does not flag a normal function', async () => {
  const f = await runRule(unreachableCodeRule, 'javascript', 'function f() { doThing(); return 1; }');
  assert.equal(f.length, 0);
});

// ── IED-H002 overwritten-before-use ──────────────────────────────────────────

test('IED-H002 flags assign-then-overwrite', async () => {
  const f = await runRule(
    overwrittenBeforeUseRule,
    'javascript',
    'function f() { let v = 1; v = 2; return v; }'
  );
  assert.ok(f.some((d) => d.ruleId === 'IED-H002'));
});

test('IED-H002 does not flag when the value is read first', async () => {
  const f = await runRule(
    overwrittenBeforeUseRule,
    'javascript',
    'function f() { let v = 1; use(v); v = 2; return v; }'
  );
  assert.equal(f.length, 0);
});

test('IED-H002 does not flag v = v + 1 (old value read on RHS)', async () => {
  const f = await runRule(
    overwrittenBeforeUseRule,
    'javascript',
    'function f() { let v = 1; v = v + 1; return v; }'
  );
  assert.equal(f.length, 0);
});
