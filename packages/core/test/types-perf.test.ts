import * as assert from 'assert';
import { test, runRule } from './harness';
import {
  unsafeAsRule,
  anyTypeRule,
  nonNullAssertionRule
} from '../src/rules/typescript/type-issues';
import { nestedLoopRule } from '../src/rules/performance/nested-loop';
import { cognitiveComplexityRule } from '../src/rules/heuristics/complexity';

const has = (found: Awaited<ReturnType<typeof runRule>>, id: string): boolean =>
  found.some((d) => d.ruleId === id);
const countOf = (found: Awaited<ReturnType<typeof runRule>>, id: string): number =>
  found.filter((d) => d.ruleId === id).length;

// ---------------------------------------------------------------------------
// IED-T001 unsafe-as
// ---------------------------------------------------------------------------

test('IED-T001 flags a plain `as` cast', async () => {
  const found = await runRule(unsafeAsRule, 'typescript', 'const u = data as User;');
  assert.ok(has(found, 'IED-T001'));
});

test('IED-T001 flags angle-bracket type assertion', async () => {
  const found = await runRule(unsafeAsRule, 'typescript', 'const u = <User>data;');
  assert.ok(has(found, 'IED-T001'));
});

test('IED-T001 ignores `as const` and `as unknown`', async () => {
  const found = await runRule(
    unsafeAsRule,
    'typescript',
    'const a = x as const;\nconst b = y as unknown;'
  );
  assert.equal(countOf(found, 'IED-T001'), 0);
});

// ---------------------------------------------------------------------------
// IED-T002 any-type
// ---------------------------------------------------------------------------

test('IED-T002 flags each `any`', async () => {
  const found = await runRule(
    anyTypeRule,
    'typescript',
    'function f(p: any): any { let q: any; return p; }'
  );
  assert.equal(countOf(found, 'IED-T002'), 3);
});

test('IED-T002 ignores precise types', async () => {
  const found = await runRule(anyTypeRule, 'typescript', 'function f(p: string): number { return 1; }');
  assert.equal(countOf(found, 'IED-T002'), 0);
});

// ---------------------------------------------------------------------------
// IED-T003 non-null-assertion
// ---------------------------------------------------------------------------

test('IED-T003 flags the `!` non-null assertion', async () => {
  const found = await runRule(nonNullAssertionRule, 'typescript', 'const id = user!.id;');
  assert.ok(has(found, 'IED-T003'));
});

test('IED-T003 ignores plain member access', async () => {
  const found = await runRule(nonNullAssertionRule, 'typescript', 'const id = user.id;');
  assert.equal(countOf(found, 'IED-T003'), 0);
});

// ---------------------------------------------------------------------------
// IED-P001 nested-loop
// ---------------------------------------------------------------------------

test('IED-P001 flags two for-of loops over the same collection', async () => {
  const code = [
    'for (const a of items) {',
    '  for (const b of items) {',
    '    if (a.id === b.id) hit(a, b);',
    '  }',
    '}'
  ].join('\n');
  const found = await runRule(nestedLoopRule, 'javascript', code);
  assert.ok(has(found, 'IED-P001'));
});

test('IED-P001 flags two nested `.length` array scans', async () => {
  const code = [
    'for (let i = 0; i < arr.length; i++) {',
    '  for (let j = 0; j < other.length; j++) {',
    '    use(i, j);',
    '  }',
    '}'
  ].join('\n');
  const found = await runRule(nestedLoopRule, 'javascript', code);
  assert.ok(has(found, 'IED-P001'));
});

test('IED-P001 ignores a single loop', async () => {
  const code = 'for (const a of items) { use(a); }';
  const found = await runRule(nestedLoopRule, 'javascript', code);
  assert.equal(countOf(found, 'IED-P001'), 0);
});

test('IED-P001 ignores nested loops over different collections', async () => {
  const code = [
    'for (const a of rows) {',
    '  for (const b of cols) {',
    '    cell(a, b);',
    '  }',
    '}'
  ].join('\n');
  const found = await runRule(nestedLoopRule, 'javascript', code);
  assert.equal(countOf(found, 'IED-P001'), 0);
});

// ---------------------------------------------------------------------------
// IED-H001 cognitive-complexity
// ---------------------------------------------------------------------------

test('IED-H001 flags a function over the complexity threshold', async () => {
  // Deeply nested branches + boolean chains push the score well above 15.
  const code = [
    'function big(a, b, c, d) {',
    '  if (a && b) {',          // +1 (if) +1 (&&)
    '    for (const x of a) {',  // +2 (for at depth 1)
    '      if (b || c) {',       // +3 (if at depth 2) +1 (||)
    '        while (c && d) {',  // +4 (while at depth 3) +1 (&&)
    '          if (d) {',        // +5 (if at depth 4)
    '            return x;',
    '          }',
    '        }',
    '      }',
    '    }',
    '  }',
    '  return 0;',
    '}'
  ].join('\n');
  const found = await runRule(cognitiveComplexityRule, 'javascript', code);
  assert.ok(has(found, 'IED-H001'));
});

test('IED-H001 ignores a simple function', async () => {
  const code = 'function small(a) {\n  if (a) return 1;\n  return 0;\n}';
  const found = await runRule(cognitiveComplexityRule, 'javascript', code);
  assert.equal(countOf(found, 'IED-H001'), 0);
});

test('IED-H001 honours a custom threshold', async () => {
  const code = 'function f(a, b) {\n  if (a) {\n    if (b) return 1;\n  }\n  return 0;\n}';
  // With threshold 1, the score (1 + 2 = 3) exceeds it.
  const found = await runRule(cognitiveComplexityRule, 'javascript', code, { config: { threshold: 1 } });
  assert.ok(has(found, 'IED-H001'));
});
