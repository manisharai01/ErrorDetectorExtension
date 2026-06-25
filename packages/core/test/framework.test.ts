/**
 * Tests for the framework rules (React IED-F001..F004, Vue IED-F005).
 * JSX cases use the 'tsx' language; the Vue ref rule uses 'typescript'.
 */

import * as assert from 'assert';
import { test, runRule } from './harness';
import {
  hookDepsRule,
  missingKeyRule,
  stateMutationRule,
  stateAfterUnmountRule
} from '../src/rules/framework-specific/react';
import { vueRefMisuseRule } from '../src/rules/framework-specific/vue';

// ── IED-F001 hook-deps ───────────────────────────────────────────────────────

test('IED-F001 flags useEffect with no dependency array', async () => {
  const code = 'function C(){ React.useEffect(() => {}); return null; }';
  const found = await runRule(hookDepsRule, 'tsx', code);
  assert.ok(found.some((d) => d.ruleId === 'IED-F001'));
});

test('IED-F001 flags bare useMemo/useCallback without deps', async () => {
  const code = 'const a = useMemo(() => 1); const b = useCallback(() => {});';
  const found = await runRule(hookDepsRule, 'tsx', code);
  assert.equal(found.filter((d) => d.ruleId === 'IED-F001').length, 2);
});

test('IED-F001 ignores useEffect with a dependency array', async () => {
  const code = 'function C(){ useEffect(() => {}, []); return null; }';
  const found = await runRule(hookDepsRule, 'tsx', code);
  assert.equal(found.filter((d) => d.ruleId === 'IED-F001').length, 0);
});

test('IED-F001 ignores non-hook single-arg calls', async () => {
  const found = await runRule(hookDepsRule, 'tsx', 'doStuff(() => {});');
  assert.equal(found.filter((d) => d.ruleId === 'IED-F001').length, 0);
});

// ── IED-F002 missing-key ─────────────────────────────────────────────────────

test('IED-F002 flags JSX from .map() without a key', async () => {
  const code = 'const list = items.map(i => <li>{i}</li>);';
  const found = await runRule(missingKeyRule, 'tsx', code);
  assert.ok(found.some((d) => d.ruleId === 'IED-F002'));
});

test('IED-F002 ignores JSX from .map() that has a key', async () => {
  const code = 'const list = items.map(i => <li key={i.id}>{i.name}</li>);';
  const found = await runRule(missingKeyRule, 'tsx', code);
  assert.equal(found.filter((d) => d.ruleId === 'IED-F002').length, 0);
});

test('IED-F002 ignores .map() that does not return JSX', async () => {
  const code = 'const list = items.map(i => i * 2);';
  const found = await runRule(missingKeyRule, 'tsx', code);
  assert.equal(found.filter((d) => d.ruleId === 'IED-F002').length, 0);
});

// ── IED-F003 state-mutation ──────────────────────────────────────────────────

test('IED-F003 flags reassigning a useState value', async () => {
  const code = 'function C(){ const [count, setCount] = useState(0); count = 5; }';
  const found = await runRule(stateMutationRule, 'tsx', code);
  assert.ok(found.some((d) => d.ruleId === 'IED-F003'));
});

test('IED-F003 flags mutating-method calls on state arrays', async () => {
  const code = 'function C(){ const [items, setItems] = useState([]); items.push(1); }';
  const found = await runRule(stateMutationRule, 'tsx', code);
  assert.ok(found.some((d) => d.ruleId === 'IED-F003'));
});

test('IED-F003 ignores using the setter', async () => {
  const code =
    'function C(){ const [count, setCount] = useState(0); setCount(count + 1); }';
  const found = await runRule(stateMutationRule, 'tsx', code);
  assert.equal(found.filter((d) => d.ruleId === 'IED-F003').length, 0);
});

test('IED-F003 ignores assignment to a non-state variable', async () => {
  const code = 'function C(){ let total = 0; total = 5; }';
  const found = await runRule(stateMutationRule, 'tsx', code);
  assert.equal(found.filter((d) => d.ruleId === 'IED-F003').length, 0);
});

// ── IED-F004 state-after-unmount ─────────────────────────────────────────────

test('IED-F004 flags setX inside a .then() callback', async () => {
  const code = 'function C(){ fetch(url).then(r => setData(r)); }';
  const found = await runRule(stateAfterUnmountRule, 'tsx', code);
  assert.ok(found.some((d) => d.ruleId === 'IED-F004'));
});

test('IED-F004 ignores setX called synchronously', async () => {
  const code = 'function C(){ setData(123); }';
  const found = await runRule(stateAfterUnmountRule, 'tsx', code);
  assert.equal(found.filter((d) => d.ruleId === 'IED-F004').length, 0);
});

test('IED-F004 stays quiet when an isMounted guard is present', async () => {
  const code =
    'function C(){ let isMounted = true; fetch(url).then(r => setData(r)); }';
  const found = await runRule(stateAfterUnmountRule, 'tsx', code);
  assert.equal(found.filter((d) => d.ruleId === 'IED-F004').length, 0);
});

// ── IED-F005 vue ref-misuse ──────────────────────────────────────────────────

test('IED-F005 flags reassigning a ref binding', async () => {
  const code = 'const count = ref(0); count = 5;';
  const found = await runRule(vueRefMisuseRule, 'typescript', code);
  assert.ok(found.some((d) => d.ruleId === 'IED-F005'));
});

test('IED-F005 ignores assigning to ref.value', async () => {
  const code = 'const count = ref(0); count.value = 5;';
  const found = await runRule(vueRefMisuseRule, 'typescript', code);
  assert.equal(found.filter((d) => d.ruleId === 'IED-F005').length, 0);
});

test('IED-F005 ignores non-ref variable reassignment', async () => {
  const code = 'const count = reactive(0); count = 5;';
  const found = await runRule(vueRefMisuseRule, 'typescript', code);
  assert.equal(found.filter((d) => d.ruleId === 'IED-F005').length, 0);
});
