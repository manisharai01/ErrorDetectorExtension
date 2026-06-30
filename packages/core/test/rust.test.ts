/** Rust rule pack: true-positive + true-negative per rule. */
import * as assert from 'assert';
import { test, runRule } from './harness';
import {
  unwrapInProdRule,
  nestedMutexLockRule,
  dbgMacroRule,
  unsafeWithoutCommentRule,
  needlessCloneRule
} from '../src/rules/rust/index';

const has = (ds: { ruleId: string }[], id: string) => ds.some((d) => d.ruleId === id);

// IED-T006 unwrap-in-prod
test('IED-T006 flags .unwrap() in prod code', async () => {
  assert.ok(has(await runRule(unwrapInProdRule, 'rust', 'fn f(o: Option<i32>) { let x = o.unwrap(); }'), 'IED-T006'));
});
test('IED-T006 is silent in test files', async () => {
  const d = await runRule(unwrapInProdRule, 'rust', 'fn f(o: Option<i32>) { let x = o.unwrap(); }', { isTestFile: true });
  assert.equal(d.length, 0);
});
test('IED-T006 ignores code with no unwrap', async () => {
  assert.equal((await runRule(unwrapInProdRule, 'rust', 'fn f(o: Option<i32>) { if let Some(x) = o { } }')).length, 0);
});

// IED-C009 nested-mutex-lock
test('IED-C009 flags a nested .lock()', async () => {
  assert.ok(has(await runRule(nestedMutexLockRule, 'rust', 'fn f() { let a = m1.lock(); { let b = m2.lock(); } }'), 'IED-C009'));
});
test('IED-C009 ignores a single lock', async () => {
  assert.equal((await runRule(nestedMutexLockRule, 'rust', 'fn f() { let a = m1.lock(); }')).length, 0);
});

// IED-Q012 dbg-macro
test('IED-Q012 flags dbg!()', async () => {
  assert.ok(has(await runRule(dbgMacroRule, 'rust', 'fn f() { dbg!(x); }'), 'IED-Q012'));
});
test('IED-Q012 ignores code with no dbg!', async () => {
  assert.equal((await runRule(dbgMacroRule, 'rust', 'fn f() { println!("x"); }')).length, 0);
});

// IED-R007 unsafe-without-comment
test('IED-R007 flags unsafe block without SAFETY comment', async () => {
  assert.ok(has(await runRule(unsafeWithoutCommentRule, 'rust', 'fn f() { unsafe { g(); } }'), 'IED-R007'));
});
test('IED-R007 accepts unsafe with a SAFETY comment', async () => {
  const code = 'fn f() {\n    // SAFETY: g is sound because the ptr is valid here\n    unsafe { g(); }\n}';
  assert.equal((await runRule(unsafeWithoutCommentRule, 'rust', code)).length, 0);
});

// IED-P009 needless-clone
test('IED-P009 flags x.clone()', async () => {
  assert.ok(has(await runRule(needlessCloneRule, 'rust', 'fn f() { let y = x.clone(); }'), 'IED-P009'));
});
test('IED-P009 is silent in test files', async () => {
  assert.equal((await runRule(needlessCloneRule, 'rust', 'fn f() { let y = x.clone(); }', { isTestFile: true })).length, 0);
});
