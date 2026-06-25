/**
 * Tests for the Python rule pack. Each rule gets a true-positive, a
 * true-negative, and an edge case, per the SDK testing guidance.
 */

import * as assert from 'assert';
import { test, runRule } from './harness';
import { mutableDefaultArgRule } from '../src/rules/python/mutable-default-arg';
import { lateBindingClosureRule } from '../src/rules/python/late-binding-closure';
import { bareExceptRule } from '../src/rules/python/bare-except';
import { fstringInjectionRule } from '../src/rules/python/fstring-injection';
import { pickleUntrustedRule } from '../src/rules/python/pickle-untrusted';
import { isVsEqualsRule } from '../src/rules/python/is-vs-equals';
import { printStatementRule } from '../src/rules/python/print-statement';
import { nPlusOneQueryRule } from '../src/rules/python/n-plus-one';
import { syncInAsyncRule } from '../src/rules/python/sync-in-async';
import { openWithoutContextRule } from '../src/rules/python/open-without-context';

// ── IED-L011 mutable-default-arg ─────────────────────────────────────────────

test('IED-L011 flags a mutable list default', async () => {
  const f = await runRule(mutableDefaultArgRule, 'python', 'def f(a, b=[]):\n    return b\n');
  assert.ok(f.some((d) => d.ruleId === 'IED-L011'));
});

test('IED-L011 ignores immutable defaults', async () => {
  const f = await runRule(mutableDefaultArgRule, 'python', 'def f(a, b=1, c="x", d=()):\n    return a\n');
  assert.equal(f.length, 0);
});

test('IED-L011 also flags dict and set defaults', async () => {
  const f = await runRule(mutableDefaultArgRule, 'python', 'def f(a={}, b={1, 2}):\n    return a\n');
  assert.equal(f.length, 2);
});

// ── IED-L012 late-binding-closure ────────────────────────────────────────────

test('IED-L012 flags a lambda capturing the loop variable', async () => {
  const f = await runRule(
    lateBindingClosureRule,
    'python',
    'fns = []\nfor i in range(3):\n    fns.append(lambda: i)\n'
  );
  assert.ok(f.some((d) => d.ruleId === 'IED-L012'));
});

test('IED-L012 does not flag a lambda that binds the variable as a default', async () => {
  const f = await runRule(
    lateBindingClosureRule,
    'python',
    'fns = []\nfor i in range(3):\n    fns.append(lambda i=i: i)\n'
  );
  assert.equal(f.length, 0);
});

test('IED-L012 flags the comprehension form too', async () => {
  const f = await runRule(lateBindingClosureRule, 'python', 'fns = [lambda: n for n in range(5)]\n');
  assert.ok(f.some((d) => d.ruleId === 'IED-L012'));
});

// ── IED-S011 bare-except ─────────────────────────────────────────────────────

test('IED-S011 flags bare except', async () => {
  const f = await runRule(bareExceptRule, 'python', 'try:\n    x()\nexcept:\n    pass\n');
  assert.ok(f.some((d) => d.ruleId === 'IED-S011'));
});

test('IED-S011 does not flag a typed except', async () => {
  const f = await runRule(bareExceptRule, 'python', 'try:\n    x()\nexcept ValueError:\n    pass\n');
  assert.equal(f.length, 0);
});

test('IED-S011 does not flag a tuple-typed except', async () => {
  const f = await runRule(
    bareExceptRule,
    'python',
    'try:\n    x()\nexcept (KeyError, IndexError):\n    pass\n'
  );
  assert.equal(f.length, 0);
});

// ── IED-S012 fstring-injection ───────────────────────────────────────────────

test('IED-S012 flags an f-string passed to execute()', async () => {
  const f = await runRule(
    fstringInjectionRule,
    'python',
    'cur.execute(f"SELECT * FROM t WHERE id = {uid}")\n'
  );
  assert.ok(f.some((d) => d.ruleId === 'IED-S012'));
});

test('IED-S012 does not flag a parameterized query', async () => {
  const f = await runRule(
    fstringInjectionRule,
    'python',
    'cur.execute("SELECT * FROM t WHERE id = %s", (uid,))\n'
  );
  assert.equal(f.length, 0);
});

test('IED-S012 flags an f-string assigned to a sql-named variable', async () => {
  const f = await runRule(fstringInjectionRule, 'python', 'query = f"SELECT {col} FROM t"\n');
  assert.ok(f.some((d) => d.ruleId === 'IED-S012'));
});

test('IED-S012 does not flag a plain interpolated message', async () => {
  const f = await runRule(fstringInjectionRule, 'python', 'message = f"Hello {name}"\n');
  assert.equal(f.length, 0);
});

// ── IED-S013 pickle-untrusted ────────────────────────────────────────────────

test('IED-S013 flags pickle.loads', async () => {
  const f = await runRule(pickleUntrustedRule, 'python', 'import pickle\npickle.loads(blob)\n');
  assert.ok(f.some((d) => d.ruleId === 'IED-S013'));
});

test('IED-S013 flags yaml.load without a Loader', async () => {
  const f = await runRule(pickleUntrustedRule, 'python', 'import yaml\nyaml.load(s)\n');
  assert.ok(f.some((d) => d.ruleId === 'IED-S013'));
});

test('IED-S013 does not flag yaml.load with a safe Loader', async () => {
  const f = await runRule(
    pickleUntrustedRule,
    'python',
    'import yaml\nyaml.load(s, Loader=yaml.SafeLoader)\n'
  );
  assert.equal(f.length, 0);
});

test('IED-S013 does not flag pickle.dumps', async () => {
  const f = await runRule(pickleUntrustedRule, 'python', 'import pickle\npickle.dumps(obj)\n');
  assert.equal(f.length, 0);
});

// ── IED-L013 is-vs-equals ────────────────────────────────────────────────────

test('IED-L013 flags `is` against an int literal', async () => {
  const f = await runRule(isVsEqualsRule, 'python', 'if x is 5:\n    pass\n');
  assert.ok(f.some((d) => d.ruleId === 'IED-L013'));
});

test('IED-L013 does not flag `is None`', async () => {
  const f = await runRule(isVsEqualsRule, 'python', 'if x is None:\n    pass\n');
  assert.equal(f.length, 0);
});

test('IED-L013 flags `is not` against a string and ignores ==', async () => {
  const f = await runRule(isVsEqualsRule, 'python', 'a = x is not "foo"\nb = x == 5\n');
  assert.equal(f.length, 1);
  assert.equal(f[0].ruleId, 'IED-L013');
});

// ── IED-Q009 print-statement ─────────────────────────────────────────────────

test('IED-Q009 flags a print call', async () => {
  const f = await runRule(printStatementRule, 'python', 'print("debug")\n');
  assert.ok(f.some((d) => d.ruleId === 'IED-Q009'));
});

test('IED-Q009 does not flag logging', async () => {
  const f = await runRule(printStatementRule, 'python', 'logger.info("ok")\n');
  assert.equal(f.length, 0);
});

test('IED-Q009 is relaxed inside test files', async () => {
  const f = await runRule(printStatementRule, 'python', 'print("x")\n', { isTestFile: true });
  assert.equal(f.length, 0);
});

// ── IED-P007 n-plus-one-query ────────────────────────────────────────────────

test('IED-P007 flags an ORM query inside a loop', async () => {
  const f = await runRule(
    nPlusOneQueryRule,
    'python',
    'for o in orders:\n    Item.objects.filter(order_id=o.id)\n'
  );
  assert.ok(f.some((d) => d.ruleId === 'IED-P007'));
});

test('IED-P007 does not flag a query outside a loop', async () => {
  const f = await runRule(nPlusOneQueryRule, 'python', 'items = Item.objects.filter(active=True)\n');
  assert.equal(f.length, 0);
});

test('IED-P007 does not flag a plain method call in a loop', async () => {
  const f = await runRule(nPlusOneQueryRule, 'python', 'for o in orders:\n    o.process()\n');
  assert.equal(f.length, 0);
});

// ── IED-C007 sync-in-async ───────────────────────────────────────────────────

test('IED-C007 flags requests.get inside an async function', async () => {
  const f = await runRule(
    syncInAsyncRule,
    'python',
    'async def fetch(u):\n    return requests.get(u)\n'
  );
  assert.ok(f.some((d) => d.ruleId === 'IED-C007'));
});

test('IED-C007 does not flag blocking calls in a sync function', async () => {
  const f = await runRule(syncInAsyncRule, 'python', 'def fetch(u):\n    return requests.get(u)\n');
  assert.equal(f.length, 0);
});

test('IED-C007 flags time.sleep and open inside async too', async () => {
  const f = await runRule(
    syncInAsyncRule,
    'python',
    'async def go(p):\n    time.sleep(1)\n    return open(p)\n'
  );
  assert.equal(f.length, 2);
});

// ── IED-R005 open-without-context ────────────────────────────────────────────

test('IED-R005 flags open() assigned to a variable', async () => {
  const f = await runRule(openWithoutContextRule, 'python', 'f = open("x.txt")\n');
  assert.ok(f.some((d) => d.ruleId === 'IED-R005'));
});

test('IED-R005 does not flag with open(...) as f', async () => {
  const f = await runRule(
    openWithoutContextRule,
    'python',
    'with open("x.txt") as f:\n    pass\n'
  );
  assert.equal(f.length, 0);
});

test('IED-R005 does not flag a non-open assignment', async () => {
  const f = await runRule(openWithoutContextRule, 'python', 'f = compute("x.txt")\n');
  assert.equal(f.length, 0);
});
