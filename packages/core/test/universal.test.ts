/**
 * Tests for the universal rules. Each rule gets a true-positive, a
 * true-negative, and an edge case, per the SDK testing guidance.
 */

import * as assert from 'assert';
import { test, runRule } from './harness';
import { consoleLogRule } from '../src/rules/universal/console-log';
import { deepNestingRule } from '../src/rules/universal/deep-nesting';

// ── IED-Q001 console-log ─────────────────────────────────────────────────────

test('IED-Q001 flags console.log', async () => {
  const found = await runRule(consoleLogRule, 'javascript', 'console.log("hi");');
  assert.equal(found.length, 1, 'expected exactly one finding');
  assert.equal(found[0].ruleId, 'IED-Q001');
});

test('IED-Q001 ignores code with no console call', async () => {
  const found = await runRule(consoleLogRule, 'typescript', 'const x: number = 1 + 2;');
  assert.equal(found.length, 0);
});

test('IED-Q001 is relaxed inside test files', async () => {
  const found = await runRule(consoleLogRule, 'javascript', 'console.error("x");', {
    isTestFile: true
  });
  assert.equal(found.length, 0);
});

test('IED-Q001 catches console.warn/error/info/debug too', async () => {
  const code = 'console.warn(1); console.error(2); console.info(3); console.debug(4);';
  const found = await runRule(consoleLogRule, 'javascript', code);
  assert.equal(found.length, 4);
});

// ── IED-Q004 deep-nesting ────────────────────────────────────────────────────

test('IED-Q004 flags nesting deeper than the default threshold (4)', async () => {
  const code = `
    function f(a, b, c, d, e) {
      if (a) {
        if (b) {
          if (c) {
            if (d) {
              if (e) { return 1; }
            }
          }
        }
      }
    }
  `;
  const found = await runRule(deepNestingRule, 'javascript', code);
  assert.ok(found.some((d) => d.ruleId === 'IED-Q004'), 'expected a deep-nesting finding');
});

test('IED-Q004 does not flag shallow nesting', async () => {
  const code = `
    function f(a, b) {
      if (a) {
        if (b) { return 1; }
      }
    }
  `;
  const found = await runRule(deepNestingRule, 'javascript', code);
  assert.equal(found.length, 0);
});

test('IED-Q004 honours a custom threshold option', async () => {
  const code = `
    function f(a, b) {
      if (a) {
        if (b) { return 1; }
      }
    }
  `;
  const found = await runRule(deepNestingRule, 'javascript', code, {
    config: { threshold: 1 }
  });
  assert.ok(found.length >= 1, 'threshold=1 should flag the second if');
});
