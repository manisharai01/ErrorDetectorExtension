/** Swift rule pack: true-positive + true-negative + edge per rule. */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { test, runRule } from './harness';
import {
  forceUnwrapRule,
  retainCycleRule,
  mainActorViolationRule,
  printStatementRule
} from '../src/rules/swift/index';

const has = (ds: { ruleId: string }[], id: string) => ds.some((d) => d.ruleId === id);
// Tests run from compiled dist-test/test, which has no copied fixtures, so
// resolve from the source `test/fixtures` tree (matching the c-family/php packs).
const fixture = (name: string): string => {
  const candidates = [
    path.join(__dirname, 'fixtures', 'swift', name),
    path.resolve(__dirname, '..', '..', 'test', 'fixtures', 'swift', name),
    path.resolve(__dirname, '..', '..', '..', 'test', 'fixtures', 'swift', name)
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8');
  }
  return fs.readFileSync(candidates[0], 'utf8');
};

// ---------------------------------------------------------------------------
// IED-T008 force-unwrap
// ---------------------------------------------------------------------------
test('IED-T008 flags a force unwrap `name!`', async () => {
  assert.ok(has(await runRule(forceUnwrapRule, 'swift', 'func f(_ a: Int?) { let x = a! }'), 'IED-T008'));
});
test('IED-T008 ignores optional binding and ??', async () => {
  assert.equal(
    (await runRule(forceUnwrapRule, 'swift', 'func f(_ a: Int?) { let x = a ?? 0 }')).length,
    0
  );
});
test('IED-T008 does not flag try! (a distinct node)', async () => {
  assert.equal(
    (await runRule(forceUnwrapRule, 'swift', 'func f() throws { let x = try! foo() }')).length,
    0
  );
});
test('IED-T008 fires on the bad fixture, silent on the good one', async () => {
  assert.ok(has(await runRule(forceUnwrapRule, 'swift', fixture('force-unwrap-bad.swift')), 'IED-T008'));
  assert.equal((await runRule(forceUnwrapRule, 'swift', fixture('force-unwrap-good.swift'))).length, 0);
});

// ---------------------------------------------------------------------------
// IED-R009 retain-cycle
// ---------------------------------------------------------------------------
test('IED-R009 flags a strong self capture', async () => {
  assert.ok(has(await runRule(retainCycleRule, 'swift', 'func f() { obj.run { self.x() } }'), 'IED-R009'));
});
test('IED-R009 ignores [weak self]', async () => {
  assert.equal(
    (await runRule(retainCycleRule, 'swift', 'func f() { obj.run { [weak self] in self?.x() } }')).length,
    0
  );
});
test('IED-R009 ignores a closure that never touches self', async () => {
  assert.equal(
    (await runRule(retainCycleRule, 'swift', 'func f() { xs.map { v in v * 2 } }')).length,
    0
  );
});
test('IED-R009 fires on the bad fixture, silent on the good one', async () => {
  assert.ok(has(await runRule(retainCycleRule, 'swift', fixture('retain-cycle-bad.swift')), 'IED-R009'));
  assert.equal((await runRule(retainCycleRule, 'swift', fixture('retain-cycle-good.swift'))).length, 0);
});

// ---------------------------------------------------------------------------
// IED-C012 main-actor-violation
// ---------------------------------------------------------------------------
test('IED-C012 flags a UI assignment in a global queue closure', async () => {
  assert.ok(
    has(
      await runRule(
        mainActorViolationRule,
        'swift',
        'func f() { DispatchQueue.global().async { self.label.text = "hi" } }'
      ),
      'IED-C012'
    )
  );
});
test('IED-C012 ignores the same assignment on DispatchQueue.main', async () => {
  assert.equal(
    (
      await runRule(
        mainActorViolationRule,
        'swift',
        'func f() { DispatchQueue.main.async { self.label.text = "hi" } }'
      )
    ).length,
    0
  );
});
test('IED-C012 ignores a non-UI assignment in a global queue closure', async () => {
  assert.equal(
    (
      await runRule(
        mainActorViolationRule,
        'swift',
        'func f() { DispatchQueue.global().async { self.counter = 1 } }'
      )
    ).length,
    0
  );
});
test('IED-C012 fires on the bad fixture, silent on the good one (re-dispatch to main)', async () => {
  assert.ok(has(await runRule(mainActorViolationRule, 'swift', fixture('main-actor-bad.swift')), 'IED-C012'));
  assert.equal((await runRule(mainActorViolationRule, 'swift', fixture('main-actor-good.swift'))).length, 0);
});

// ---------------------------------------------------------------------------
// IED-Q015 print-statement
// ---------------------------------------------------------------------------
test('IED-Q015 flags print and debugPrint', async () => {
  assert.ok(has(await runRule(printStatementRule, 'swift', 'func f() { print("x") }'), 'IED-Q015'));
  assert.ok(has(await runRule(printStatementRule, 'swift', 'func f() { debugPrint("x") }'), 'IED-Q015'));
});
test('IED-Q015 ignores a member call like logger.print()', async () => {
  assert.equal(
    (await runRule(printStatementRule, 'swift', 'func f() { logger.print() }')).length,
    0
  );
});
test('IED-Q015 is silent in test files', async () => {
  assert.equal(
    (await runRule(printStatementRule, 'swift', 'func f() { print("x") }', { isTestFile: true })).length,
    0
  );
});
test('IED-Q015 fires on the bad fixture, silent on the good one', async () => {
  assert.ok(has(await runRule(printStatementRule, 'swift', fixture('print-bad.swift')), 'IED-Q015'));
  assert.equal((await runRule(printStatementRule, 'swift', fixture('print-good.swift'))).length, 0);
});
