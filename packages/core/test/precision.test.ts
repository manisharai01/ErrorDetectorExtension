/**
 * Precision guards found by running the engine on a real FastAPI + React
 * project: idioms that used to be reported but are not bugs.
 */
import * as assert from 'assert';
import { test, runRule } from './harness';
import { magicNumbersRule } from '../src/rules/code-smells/magic-numbers';
import { nPlusOneQueryRule } from '../src/rules/python/n-plus-one';
import { lateBindingClosureRule } from '../src/rules/python/late-binding-closure';
import { objectMutationRule } from '../src/rules/logic/object-mutation';
import { inconsistentUsageRule } from '../src/rules/heuristics/inconsistent-usage';
import { printStatementRule } from '../src/rules/python/print-statement';

const values = (ds: { data?: Record<string, unknown> }[]) => ds.map((d) => d.data?.value);

// ── IED-Q003 magic-numbers: numbers the code already names ──────────────────
test('IED-Q003 (Python) skips assignments, annotated fields, kwargs, defaults and dict values', async () => {
  const code = [
    'TIMEOUT = 30',
    'class Settings:',
    '    api_port: int = 8000',
    '    weight: float = Field(default=1.5, ge=0.25, le=4.0)',
    'def plan(max_chars: int = 320, fps=24):',
    '    priority = {"approved": 80, "generated": 60}',
    '    self.retries = 7',
    '    return render(width=1920, height=1080, scale=-0.5)',
    'def bad(n):',
    '    return n * 86400 + max(40, n // 3)'
  ].join('\n');
  const found = await runRule(magicNumbersRule, 'python', code);
  assert.deepStrictEqual(values(found), ['86400', '40', '3']);
});

test('IED-Q003 (JS/TS) skips object values, parameter defaults and class fields', async () => {
  const code = [
    'function retry(fn, attempts = 5) {',
    '  return schedule({ delayMs: 250, factor: 1.5 }, attempts);',
    '}',
    'class Poller { intervalMs = 3000; }',
    'enum Level { Low = 10, High = 90 }',
    'setTimeout(tick, 86400000);'
  ].join('\n');
  const found = await runRule(magicNumbersRule, 'typescript', code);
  assert.deepStrictEqual(values(found), ['86400000']);
});

test('IED-Q003 treats 0.0/1.0, unit conversions and HTTP codes as well known', async () => {
  const code = [
    'progress = max(0.0, min(1.0, fraction))',
    'mb = total / 1024 / 1024',
    'ms = seconds * 1000',
    'raise HTTPException(404, "missing")',
    'if retries > 7:',
    '    pass'
  ].join('\n');
  assert.deepStrictEqual(values(await runRule(magicNumbersRule, 'python', code)), ['7']);
});

test('IED-Q003 skips elements of named data tables and JSX attributes', async () => {
  const py = 'SIZES = {"16:9": [(1280, 720), (1920, 1088)], "1:1": [(512, 512)]}\nprint(resize(img, 640))\n';
  assert.deepStrictEqual(values(await runRule(magicNumbersRule, 'python', py)), ['640']);
  const tsx = 'const a = <Icon size={12} />;\nconst b = scale(img, 1.75);\n';
  assert.deepStrictEqual(values(await runRule(magicNumbersRule, 'tsx', tsx)), ['1.75']);
});

test('IED-Q003 (Python) skips subscript indexes and slice bounds', async () => {
  const code = 'short = text[:300]\nlast = parts[-4:]\nthird = items[3]\nlimit = len(text) > 280\n';
  assert.deepStrictEqual(values(await runRule(magicNumbersRule, 'python', code)), ['280']);
});

test('IED-Q003 honours an "ignore" option', async () => {
  const found = await runRule(magicNumbersRule, 'javascript', 'pad(x, 12); pad(y, 13);', {
    config: { ignore: [12] }
  });
  assert.deepStrictEqual(values(found), ['13']);
});

test('IED-Q003 skips test files (expected values belong in assertions)', async () => {
  const found = await runRule(magicNumbersRule, 'python', 'assert total(items) == 1234.5\n', { isTestFile: true });
  assert.strictEqual(found.length, 0);
});

// ── IED-P007 n-plus-one-query: only real database calls ─────────────────────
test('IED-P007 ignores dict.get / str.count / numpy-style calls in a loop', async () => {
  const code = [
    'for shot in shots:',
    '    length = shot_lengths.get(shot.id, 0)',
    '    n = shot.name.count("_")',
    '    ok = mask.all()'
  ].join('\n');
  assert.strictEqual((await runRule(nPlusOneQueryRule, 'python', code)).length, 0);
});

test('IED-P007 flags SQLAlchemy, DB-API and Django related-manager queries once per chain', async () => {
  const code = [
    'for order in orders:',
    '    user = session.query(User).filter(User.id == order.user_id).first()',
    '    self.db.execute("SELECT 1")',
    '    items = order.item_set.all()',
    '    first = Item.objects.filter(order=order).first().name'
  ].join('\n');
  const found = await runRule(nPlusOneQueryRule, 'python', code);
  assert.deepStrictEqual(
    found.map((d) => d.data?.method),
    ['first', 'execute', 'all', 'first']
  );
});

// ── IED-L012 late-binding-closure: lambdas used on the spot ─────────────────
test('IED-L012 ignores lambdas consumed immediately (sort keys, map/filter)', async () => {
  const code = [
    'for amb in cues:',
    '    k = min(free, key=lambda k: abs(planned[k] - amb.start))',
    '    xs.sort(key=lambda x: x.dist(amb))',
    '    ys = list(map(lambda y: y + amb.offset, ys))',
    '    later.append(lambda: amb.play())'
  ].join('\n');
  const found = await runRule(lateBindingClosureRule, 'python', code);
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].range.start.row, 4);
});

// ── IED-L004 object-mutation: resetting an input through the event ──────────
test('IED-L004 allows writing through an event target, still flags the argument itself', async () => {
  const code = [
    'function onPick(e) { upload(e.target.files); e.target.value = ""; }',
    'function tag(opts) { opts.ready = true; }'
  ].join('\n');
  const found = await runRule(objectMutationRule, 'javascript', code);
  assert.deepStrictEqual(found.map((d) => d.data?.param), ['opts']);
});

// ── IED-H003 inconsistent-usage: shapes handled on purpose ──────────────────
test('IED-H003 skips a variable the function checks with Array.isArray', async () => {
  const code = [
    'function errorText(detail) {',
    '  if (Array.isArray(detail)) return detail.map((d) => d.msg).join("; ");',
    '  return detail.message;',
    '}'
  ].join('\n');
  assert.strictEqual((await runRule(inconsistentUsageRule, 'javascript', code)).length, 0);
});

// ── IED-Q009 print-statement: command-line scripts print on purpose ─────────
test('IED-Q009 skips modules with a __main__ guard', async () => {
  const script = 'def main():\n    print("done")\n\nif __name__ == "__main__":\n    main()\n';
  assert.strictEqual((await runRule(printStatementRule, 'python', script)).length, 0);
  const library = 'def save(x):\n    print(x)\n';
  assert.strictEqual((await runRule(printStatementRule, 'python', library)).length, 1);
});
