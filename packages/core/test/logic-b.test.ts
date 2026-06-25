/**
 * Tests for logic group B + concurrency:
 *   IED-L002 promise-swallowing
 *   IED-L004 object-mutation
 *   IED-C001 race-condition
 * Each rule has a true-positive, a true-negative, and (where useful) an edge case.
 */

import * as assert from 'assert';
import { test, runRule } from './harness';
import { promiseSwallowingRule } from '../src/rules/logic/promise-swallowing';
import { objectMutationRule } from '../src/rules/logic/object-mutation';
import { raceConditionRule } from '../src/rules/logic/race-condition';

// ── IED-L002 promise-swallowing ──────────────────────────────────────────────

test('IED-L002 flags a bare .then() with no .catch', async () => {
  const found = await runRule(promiseSwallowingRule, 'javascript', 'doWork().then(h);');
  assert.ok(found.some((d) => d.ruleId === 'IED-L002'), 'expected an unhandled-then finding');
});

test('IED-L002 flags a bare fetch() that is not awaited', async () => {
  const found = await runRule(promiseSwallowingRule, 'javascript', 'fetch("/api");');
  assert.ok(found.some((d) => d.ruleId === 'IED-L002'));
});

test('IED-L002 flags an unawaited *Async call', async () => {
  const found = await runRule(promiseSwallowingRule, 'javascript', 'loadAsync();');
  assert.ok(found.some((d) => d.ruleId === 'IED-L002'));
});

test('IED-L002 ignores .then().catch()', async () => {
  const found = await runRule(promiseSwallowingRule, 'javascript', 'doWork().then(h).catch(e);');
  assert.equal(found.filter((d) => d.ruleId === 'IED-L002').length, 0);
});

test('IED-L002 ignores an awaited fetch', async () => {
  const code = 'async function f(){ await fetch("/api"); }';
  const found = await runRule(promiseSwallowingRule, 'javascript', code);
  assert.equal(found.filter((d) => d.ruleId === 'IED-L002').length, 0);
});

test('IED-L002 ignores a returned async call', async () => {
  const code = 'function f(){ return loadAsync(); }';
  const found = await runRule(promiseSwallowingRule, 'javascript', code);
  assert.equal(found.filter((d) => d.ruleId === 'IED-L002').length, 0);
});

test('IED-L002 ignores a plain non-async call', async () => {
  const found = await runRule(promiseSwallowingRule, 'javascript', 'compute(1, 2);');
  assert.equal(found.filter((d) => d.ruleId === 'IED-L002').length, 0);
});

// ── IED-L004 object-mutation ─────────────────────────────────────────────────

test('IED-L004 flags property mutation of a parameter', async () => {
  const code = 'function f(opts){ opts.ready = true; }';
  const found = await runRule(objectMutationRule, 'javascript', code);
  assert.ok(found.some((d) => d.ruleId === 'IED-L004'), 'expected a param-mutation finding');
});

test('IED-L004 flags index mutation of a parameter', async () => {
  const code = 'function f(arr){ arr[0] = 1; }';
  const found = await runRule(objectMutationRule, 'javascript', code);
  assert.ok(found.some((d) => d.ruleId === 'IED-L004'));
});

test('IED-L004 flags augmented assignment on a parameter member', async () => {
  const code = 'function f(o){ o.count += 1; }';
  const found = await runRule(objectMutationRule, 'javascript', code);
  assert.ok(found.some((d) => d.ruleId === 'IED-L004'));
});

test('IED-L004 flags mutation of a TS-typed parameter', async () => {
  const code = 'function f(opts: Opts){ opts.x = 1; }';
  const found = await runRule(objectMutationRule, 'typescript', code);
  assert.ok(found.some((d) => d.ruleId === 'IED-L004'));
});

test('IED-L004 ignores mutation of a local variable', async () => {
  const code = 'function f(){ const local = {}; local.x = 1; }';
  const found = await runRule(objectMutationRule, 'javascript', code);
  assert.equal(found.filter((d) => d.ruleId === 'IED-L004').length, 0);
});

test('IED-L004 ignores reassigning the parameter itself', async () => {
  const code = 'function f(opts){ opts = {}; }';
  const found = await runRule(objectMutationRule, 'javascript', code);
  assert.equal(found.filter((d) => d.ruleId === 'IED-L004').length, 0);
});

// ── IED-C001 race-condition ──────────────────────────────────────────────────

test('IED-C001 flags the same variable assigned across two awaits', async () => {
  const code = 'async function f(){ shared = await load(1); shared = await load(2); }';
  const found = await runRule(raceConditionRule, 'javascript', code);
  assert.ok(found.some((d) => d.ruleId === 'IED-C001'), 'expected a race-condition finding');
});

test('IED-C001 flags awaited writes to the same member across an async method', async () => {
  const code = 'class C { async m(){ this.x = await a(); this.x = await b(); } }';
  const found = await runRule(raceConditionRule, 'typescript', code);
  assert.ok(found.some((d) => d.ruleId === 'IED-C001'));
});

test('IED-C001 ignores distinct const targets', async () => {
  const code = 'async function g(){ const a = await load(1); const b = await load(2); }';
  const found = await runRule(raceConditionRule, 'javascript', code);
  assert.equal(found.filter((d) => d.ruleId === 'IED-C001').length, 0);
});

test('IED-C001 ignores a single awaited write', async () => {
  const code = 'async function f(){ shared = await load(1); }';
  const found = await runRule(raceConditionRule, 'javascript', code);
  assert.equal(found.filter((d) => d.ruleId === 'IED-C001').length, 0);
});

test('IED-C001 ignores repeated writes outside an async function', async () => {
  const code = 'function f(){ shared = compute(1); shared = compute(2); }';
  const found = await runRule(raceConditionRule, 'javascript', code);
  assert.equal(found.filter((d) => d.ruleId === 'IED-C001').length, 0);
});
