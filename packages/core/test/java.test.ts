/** Java rule pack: true-positive + true-negative per rule. */
import * as assert from 'assert';
import { test, runRule } from './harness';
import {
  nullDerefChainRule,
  resourceNotClosedRule,
  equalsWithoutHashCodeRule,
  synchronizedNonFinalRule,
  systemOutPrintlnRule
} from '../src/rules/java/index';

const has = (ds: { ruleId: string }[], id: string) => ds.some((d) => d.ruleId === id);

// IED-L015 null-deref-chain
test('IED-L015 flags a long dereference chain', async () => {
  assert.ok(has(await runRule(nullDerefChainRule, 'java', 'class A { void m(){ int q = a.getB().getC().getD(); } }'), 'IED-L015'));
});
test('IED-L015 ignores a short access', async () => {
  assert.equal((await runRule(nullDerefChainRule, 'java', 'class A { void m(){ int q = a.getB(); } }')).length, 0);
});

// IED-R008 resource-not-closed
test('IED-R008 flags a raw new FileInputStream', async () => {
  assert.ok(has(await runRule(resourceNotClosedRule, 'java', 'class A { void m(){ FileInputStream s = new FileInputStream("f"); } }'), 'IED-R008'));
});
test('IED-R008 accepts try-with-resources', async () => {
  const code = 'class A { void m() throws Exception { try (FileInputStream s = new FileInputStream("f")) { } } }';
  assert.equal((await runRule(resourceNotClosedRule, 'java', code)).length, 0);
});

// IED-T007 equals-without-hashcode
test('IED-T007 flags equals() without hashCode()', async () => {
  assert.ok(has(await runRule(equalsWithoutHashCodeRule, 'java', 'class A { public boolean equals(Object o){ return true; } }'), 'IED-T007'));
});
test('IED-T007 accepts equals() + hashCode()', async () => {
  const code = 'class A { public boolean equals(Object o){ return true; } public int hashCode(){ return 1; } }';
  assert.equal((await runRule(equalsWithoutHashCodeRule, 'java', code)).length, 0);
});

// IED-C010 synchronized-non-final
test('IED-C010 flags synchronized on a non-final field', async () => {
  assert.ok(has(await runRule(synchronizedNonFinalRule, 'java', 'class A { Object lock = new Object(); void m(){ synchronized(lock){ } } }'), 'IED-C010'));
});
test('IED-C010 accepts synchronized on a final field', async () => {
  const code = 'class A { final Object lock = new Object(); void m(){ synchronized(lock){ } } }';
  assert.equal((await runRule(synchronizedNonFinalRule, 'java', code)).length, 0);
});

// IED-Q010 system-out-println
test('IED-Q010 flags System.out.println', async () => {
  assert.ok(has(await runRule(systemOutPrintlnRule, 'java', 'class A { void m(){ System.out.println("x"); } }'), 'IED-Q010'));
});
test('IED-Q010 is silent in test files', async () => {
  assert.equal((await runRule(systemOutPrintlnRule, 'java', 'class A { void m(){ System.out.println("x"); } }', { isTestFile: true })).length, 0);
});
