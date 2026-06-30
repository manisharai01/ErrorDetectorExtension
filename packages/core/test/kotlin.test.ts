/** Kotlin rule pack: true-positive + true-negative per rule. */
import * as assert from 'assert';
import { test, runRule } from './harness';
import {
  notNullAssertionRule,
  coroutineLeakRule,
  printlnStatementRule,
  platformTypeNullRule
} from '../src/rules/kotlin/index';

const has = (ds: { ruleId: string }[], id: string) => ds.some((d) => d.ruleId === id);

// IED-T004 not-null-assertion
test('IED-T004 flags the !! operator', async () => {
  assert.ok(has(await runRule(notNullAssertionRule, 'kotlin', 'fun f() { val x = a!! }'), 'IED-T004'));
});
test('IED-T004 ignores safe access', async () => {
  assert.equal((await runRule(notNullAssertionRule, 'kotlin', 'fun f() { val x = a?.b }')).length, 0);
});

// IED-C011 coroutine-leak
test('IED-C011 flags GlobalScope.launch', async () => {
  assert.ok(has(await runRule(coroutineLeakRule, 'kotlin', 'fun f() { GlobalScope.launch { work() } }'), 'IED-C011'));
});
test('IED-C011 ignores a scoped launch', async () => {
  assert.equal((await runRule(coroutineLeakRule, 'kotlin', 'fun f(scope: CoroutineScope) { scope.launch { work() } }')).length, 0);
});

// IED-Q011 println-statement
test('IED-Q011 flags println', async () => {
  assert.ok(has(await runRule(printlnStatementRule, 'kotlin', 'fun f() { println("x") }'), 'IED-Q011'));
});
test('IED-Q011 is silent in test files', async () => {
  assert.equal((await runRule(printlnStatementRule, 'kotlin', 'fun f() { println("x") }', { isTestFile: true })).length, 0);
});

// IED-L016 platform-type-null
test('IED-L016 flags an unguarded chain off a Java getter', async () => {
  assert.ok(has(await runRule(platformTypeNullRule, 'kotlin', 'fun f() { val x = obj.getThing().doStuff() }'), 'IED-L016'));
});
test('IED-L016 accepts safe-call access', async () => {
  assert.equal((await runRule(platformTypeNullRule, 'kotlin', 'fun f() { val x = obj.getThing()?.doStuff() }')).length, 0);
});
