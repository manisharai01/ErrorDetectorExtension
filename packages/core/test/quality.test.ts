/**
 * Tests for the ported QUALITY / code-smell rules. Each rule has a
 * true-positive and a true-negative, plus an edge case where useful.
 */

import * as assert from 'assert';
import { test, runRule } from './harness';
import { commentedCodeRule } from '../src/rules/code-smells/commented-code';
import { magicNumbersRule } from '../src/rules/code-smells/magic-numbers';
import { todoWithoutIssueRule } from '../src/rules/code-smells/todo-without-issue';
import { unusedParametersRule } from '../src/rules/code-smells/unused-parameters';
import { duplicateCodeRule } from '../src/rules/code-smells/duplicate-code';

// ── IED-Q002 commented-code ──────────────────────────────────────────────────

test('IED-Q002 flags a run of >=3 code-like comment lines', async () => {
  const code = [
    '// const x = compute();',
    '// if (x) {',
    '//   doThing(x);',
    '// }'
  ].join('\n');
  const found = await runRule(commentedCodeRule, 'javascript', code);
  assert.ok(found.some((d) => d.ruleId === 'IED-Q002'), 'expected a commented-code finding');
});

test('IED-Q002 ignores short or prose-only comment runs', async () => {
  const code = [
    '// this explains why we do the thing',
    '// in a couple of sentences',
    '// nothing code-like here at all'
  ].join('\n');
  const found = await runRule(commentedCodeRule, 'javascript', code);
  assert.equal(found.filter((d) => d.ruleId === 'IED-Q002').length, 0);
});

test('IED-Q002 does not flag only two code-like comment lines', async () => {
  const code = ['// const a = 1;', '// const b = 2;'].join('\n');
  const found = await runRule(commentedCodeRule, 'javascript', code);
  assert.equal(found.filter((d) => d.ruleId === 'IED-Q002').length, 0);
});

// ── IED-Q003 magic-numbers ───────────────────────────────────────────────────

test('IED-Q003 flags a magic number in an expression', async () => {
  const found = await runRule(magicNumbersRule, 'javascript', 'setTimeout(fn, 86400000);');
  assert.ok(found.some((d) => d.ruleId === 'IED-Q003'), 'expected a magic-number finding');
});

test('IED-Q003 ignores allowed numbers and const initializers', async () => {
  const code = 'const RETRIES = 5; const x = arr[0] + 1 - 2;';
  const found = await runRule(magicNumbersRule, 'javascript', code);
  assert.equal(found.filter((d) => d.ruleId === 'IED-Q003').length, 0);
});

test('IED-Q003 ignores numbers used as an array index', async () => {
  const found = await runRule(magicNumbersRule, 'javascript', 'const v = arr[42];');
  assert.equal(found.filter((d) => d.ruleId === 'IED-Q003').length, 0);
});

// ── IED-Q005 todo-without-issue ──────────────────────────────────────────────

test('IED-Q005 flags a TODO without an issue reference', async () => {
  const found = await runRule(todoWithoutIssueRule, 'javascript', '// TODO fix the retry logic');
  assert.ok(found.some((d) => d.ruleId === 'IED-Q005'), 'expected a todo finding');
});

test('IED-Q005 ignores a TODO that references an issue', async () => {
  const found = await runRule(
    todoWithoutIssueRule,
    'javascript',
    '// TODO(#812) fix the retry logic'
  );
  assert.equal(found.filter((d) => d.ruleId === 'IED-Q005').length, 0);
});

test('IED-Q005 accepts a JIRA-style ticket reference', async () => {
  const found = await runRule(todoWithoutIssueRule, 'javascript', '// FIXME ABC-123 broken');
  assert.equal(found.filter((d) => d.ruleId === 'IED-Q005').length, 0);
});

// ── IED-Q006 unused-parameters ───────────────────────────────────────────────

test('IED-Q006 flags an unused parameter', async () => {
  const found = await runRule(unusedParametersRule, 'javascript', 'function f(a, b) { return a; }');
  assert.ok(
    found.some((d) => d.ruleId === 'IED-Q006' && /"b"/.test(d.message)),
    'expected unused-parameter finding for b'
  );
});

test('IED-Q006 ignores used and underscore-prefixed parameters', async () => {
  const found = await runRule(
    unusedParametersRule,
    'javascript',
    'function g(_unused, b) { return b; }'
  );
  assert.equal(found.filter((d) => d.ruleId === 'IED-Q006').length, 0);
});

test('IED-Q006 handles arrow functions', async () => {
  const found = await runRule(
    unusedParametersRule,
    'javascript',
    'const h = (a, b) => { return b; };'
  );
  assert.ok(found.some((d) => d.ruleId === 'IED-Q006' && /"a"/.test(d.message)));
});

// ── IED-Q007 duplicate-code ──────────────────────────────────────────────────

test('IED-Q007 flags two structurally identical function bodies', async () => {
  const code = `
    function alpha(a, b) {
      const x = a + b;
      if (x > 0) {
        for (let i = 0; i < x; i++) {
          console.log(i);
        }
      }
      return x;
    }
    function beta(c, d) {
      const y = c + d;
      if (y > 0) {
        for (let j = 0; j < y; j++) {
          console.log(j);
        }
      }
      return y;
    }
  `;
  const found = await runRule(duplicateCodeRule, 'javascript', code);
  assert.ok(found.some((d) => d.ruleId === 'IED-Q007'), 'expected a duplicate-code finding');
});

test('IED-Q007 does not flag distinct or trivial functions', async () => {
  const code = `
    function one(a) { return a + 1; }
    function two(a, b) { return a * b - 7; }
  `;
  const found = await runRule(duplicateCodeRule, 'javascript', code);
  assert.equal(found.filter((d) => d.ruleId === 'IED-Q007').length, 0);
});
