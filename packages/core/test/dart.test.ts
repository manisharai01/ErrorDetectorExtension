/** Dart / Flutter rule pack: TP + TN per rule, quick fix, plus whole-file fixtures. */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { test, runRule, parser } from './harness';
import {
  dartPrintRule,
  dartNullAssertionRule,
  dartEmptyCatchRule,
  dartUnawaitedFutureRule,
  dartUndisposedControllerRule,
  dartBadCertificateRule,
  dartRules
} from '../src/rules/dart/index';
import { magicNumbersRule } from '../src/rules/code-smells/magic-numbers';
import { cognitiveComplexityRule } from '../src/rules/heuristics/complexity';
import { languageFromPath, looksLikeTestFile } from '../src/engine/analyzer';

const has = (ds: { ruleId: string }[], id: string) => ds.some((d) => d.ruleId === id);
const count = (ds: { ruleId: string }[], id: string) => ds.filter((d) => d.ruleId === id).length;
// Tests run from compiled dist-test/test which has NO copied fixtures — resolve from the SOURCE tree.
const fixture = (name: string): string => {
  const candidates = [
    path.join(__dirname, 'fixtures', 'dart', name),
    path.resolve(__dirname, '..', '..', 'test', 'fixtures', 'dart', name),
    path.resolve(__dirname, '..', '..', '..', 'test', 'fixtures', 'dart', name)
  ];
  for (const c of candidates) if (fs.existsSync(c)) return fs.readFileSync(c, 'utf8');
  return fs.readFileSync(candidates[0], 'utf8');
};

test('Dart: .dart files map to the dart language and the grammar loads', async () => {
  assert.strictEqual(languageFromPath('lib/main.dart'), 'dart');
  const { tree } = await parser().parse('dart', 'void main() { print("hi"); }');
  assert.strictEqual(tree.rootNode.type, 'program');
  assert.ok(!tree.rootNode.hasError, 'sample should parse without errors');
});

// IED-Q019 print-statement
test('IED-Q019 flags print()', async () => {
  const ds = await runRule(dartPrintRule, 'dart', "void f() { print('token'); }\n");
  assert.ok(has(ds, 'IED-Q019'));
});

test('IED-Q019 ignores log(), debugPrint() and a print method on an object', async () => {
  const ds = await runRule(
    dartPrintRule,
    'dart',
    "void f() { log('x'); debugPrint('y'); logger.print('z'); }\n"
  );
  assert.ok(!has(ds, 'IED-Q019'));
});

test('IED-Q019 relaxed in test files (and *_test.dart counts as a test file)', async () => {
  assert.ok(looksLikeTestFile('lib/widget_test.dart'));
  const ds = await runRule(dartPrintRule, 'dart', "void f() { print('x'); }\n", { isTestFile: true });
  assert.ok(!has(ds, 'IED-Q019'));
});

// IED-T010 null-assertion
test('IED-T010 flags the ! operator', async () => {
  const ds = await runRule(
    dartNullAssertionRule,
    'dart',
    "void f() { final a = user!.name; final b = map['k']!; }\n"
  );
  assert.strictEqual(count(ds, 'IED-T010'), 2);
});

test('IED-T010 ignores ?. and ?? and negation', async () => {
  const ds = await runRule(
    dartNullAssertionRule,
    'dart',
    "void f() { final a = user?.name ?? 'x'; final b = !ready; final c = a != b; }\n"
  );
  assert.ok(!has(ds, 'IED-T010'));
});

// IED-L024 empty-catch
test('IED-L024 flags empty catch and empty on-clause', async () => {
  const ds = await runRule(
    dartEmptyCatchRule,
    'dart',
    'void f() { try { a(); } catch (e) {} try { b(); } on FormatException {} }\n'
  );
  assert.strictEqual(count(ds, 'IED-L024'), 2);
});

test('IED-L024 ignores handled, commented and finally blocks', async () => {
  const ds = await runRule(
    dartEmptyCatchRule,
    'dart',
    'void f() { try { a(); } catch (e) { log(e); } try { b(); } catch (_) { /* best effort */ } try { c(); } finally {} }\n'
  );
  assert.ok(!has(ds, 'IED-L024'));
});

// IED-C014 unawaited-future
test('IED-C014 flags an un-awaited same-file async call and Future.delayed', async () => {
  const code = [
    'Future<void> save() async {}',
    'Future<void> run() async {',
    '  save();',
    '  this.save();',
    '  Future.delayed(Duration(seconds: 1));',
    '}'
  ].join('\n');
  const ds = await runRule(dartUnawaitedFutureRule, 'dart', code);
  assert.strictEqual(count(ds, 'IED-C014'), 3);
});

test('IED-C014 ignores await, unawaited(), .then, sync callers and sync callbacks', async () => {
  const code = [
    'Future<void> save() async {}',
    'void initState() { save(); }',
    'Future<void> run() async {',
    '  await save();',
    '  unawaited(save());',
    '  save().then((_) {});',
    '  items.forEach((i) { save(); });',
    '}'
  ].join('\n');
  const ds = await runRule(dartUnawaitedFutureRule, 'dart', code);
  assert.ok(!has(ds, 'IED-C014'), JSON.stringify(ds.map((d) => d.range.start.row)));
});

test('IED-C014 quick fix inserts await', async () => {
  const code = 'Future<void> save() async {}\nFuture<void> run() async {\n  save();\n}\n';
  const [d] = await runRule(dartUnawaitedFutureRule, 'dart', code);
  const edits = dartUnawaitedFutureRule.fix!(d, code)!;
  const fixed = code.slice(0, edits[0].startIndex) + edits[0].newText + code.slice(edits[0].endIndex);
  assert.ok(fixed.includes('  await save();'), fixed);
});

// IED-R011 undisposed-controller
test('IED-R011 flags controllers and subscriptions a State never releases', async () => {
  const code = [
    'class _S extends State<W> {',
    '  final TextEditingController _c = TextEditingController();',
    '  late AnimationController _anim;',
    '  StreamSubscription<int>? _sub;',
    '  void initState() { _anim = AnimationController(vsync: this); _sub = s.listen((_) {}); }',
    '  void dispose() { super.dispose(); }',
    '}'
  ].join('\n');
  const ds = await runRule(dartUndisposedControllerRule, 'dart', code);
  assert.strictEqual(count(ds, 'IED-R011'), 3);
});

test('IED-R011 ignores released, borrowed and non-State controllers', async () => {
  const code = [
    'class _S extends State<W> {',
    '  final _c = TextEditingController();',
    '  late TextEditingController _borrowed;',
    '  Timer? _t;',
    '  void initState() { _borrowed = widget.controller; _t = Timer.periodic(d, (_) {}); }',
    '  void dispose() { _c.dispose(); _t?.cancel(); super.dispose(); }',
    '}',
    'class Holder { final c = TextEditingController(); }'
  ].join('\n');
  const ds = await runRule(dartUndisposedControllerRule, 'dart', code);
  assert.ok(!has(ds, 'IED-R011'), JSON.stringify(ds.map((d) => d.message)));
});

// IED-S023 bad-certificate-callback
test('IED-S023 flags an always-true badCertificateCallback (assignment and cascade)', async () => {
  const code = [
    'void f() {',
    '  client.badCertificateCallback = (cert, host, port) => true;',
    '  final c = HttpClient()..badCertificateCallback = (c, h, p) { return true; };',
    '}'
  ].join('\n');
  const ds = await runRule(dartBadCertificateRule, 'dart', code);
  assert.strictEqual(count(ds, 'IED-S023'), 2);
});

test('IED-S023 ignores a conditional callback', async () => {
  const ds = await runRule(
    dartBadCertificateRule,
    'dart',
    "void f() { client.badCertificateCallback = (c, host, p) => host == 'localhost'; }\n"
  );
  assert.ok(!has(ds, 'IED-S023'));
});

// Universal rules pick up Dart through its grammar profile.
test('Universal rules: magic numbers skip Dart const/final, complexity names Dart methods', async () => {
  const magic = await runRule(
    magicNumbersRule,
    'dart',
    'const timeout = 30;\nclass A { static const retries = 5; final int port = 8080; void f() { sleep(86400); } }\n'
  );
  assert.deepStrictEqual(magic.map((d) => d.data?.value), ['86400']);

  const branches = Array.from({ length: 9 }, (_, i) => `  if (a > ${i}) { if (b) { c(); } }`).join('\n');
  const complex = await runRule(cognitiveComplexityRule, 'dart', `int score(int a, bool b) {\n${branches}\n  return a;\n}\n`);
  assert.ok(complex.some((d) => d.message.includes('"score"')), JSON.stringify(complex.map((d) => d.message)));
});

// Whole-file fixtures
test('bad.dart triggers every Dart rule', async () => {
  const code = fixture('bad.dart');
  const all: { ruleId: string }[] = [];
  for (const r of dartRules) all.push(...(await runRule(r, 'dart', code)));
  for (const id of ['IED-Q019', 'IED-T010', 'IED-L024', 'IED-C014', 'IED-R011', 'IED-S023']) {
    assert.ok(has(all, id), `expected ${id} in bad.dart`);
  }
});

test('good.dart triggers no Dart rules', async () => {
  const code = fixture('good.dart');
  const all: { ruleId: string; message: string }[] = [];
  for (const r of dartRules) all.push(...(await runRule(r, 'dart', code)));
  assert.strictEqual(all.length, 0, `expected no findings, got ${JSON.stringify(all.map((d) => d.message))}`);
});
