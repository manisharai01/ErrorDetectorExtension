/**
 * Tests for the C / C++ rule pack. Each rule gets at least a true-positive, a
 * true-negative, and an edge case, exercised against both `c` and `cpp` where
 * the construct is shared.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { test, runRule, Severity } from './harness';
import {
  bufferOverflowRule,
  formatStringRule,
  useAfterFreeRule,
  integerOverflowRule,
  printfLeftRule
} from '../src/rules/c-family';

/**
 * Resolve a fixture from the source `test/fixtures` tree. Tests run from the
 * compiled `dist-test/test` directory, which has no copied fixtures, so prefer
 * the source location and fall back to a sibling `fixtures` dir if present.
 */
const fixture = (name: string): string => {
  const candidates = [
    path.join(__dirname, 'fixtures', 'c-family', name),
    path.resolve(__dirname, '..', '..', 'test', 'fixtures', 'c-family', name),
    path.resolve(__dirname, '..', '..', '..', 'test', 'fixtures', 'c-family', name)
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8');
  }
  return fs.readFileSync(candidates[0], 'utf8');
};

// ── IED-S015 buffer-overflow ─────────────────────────────────────────────────

test('IED-S015 flags strcpy unbounded copy (c)', async () => {
  const code = `void f(char *s){ char b[8]; strcpy(b, s); }`;
  const found = await runRule(bufferOverflowRule, 'c', code);
  assert.equal(found.length, 1);
  assert.equal(found[0].ruleId, 'IED-S015');
  assert.equal(found[0].severity, Severity.Warning);
  assert.equal(found[0].data?.kind, 'unbounded-copy');
});

test('IED-S015 flags strcat/sprintf/gets too (cpp)', async () => {
  const code = `void f(char *s){ char b[4]; strcat(b, s); sprintf(b, s); gets(b); }`;
  const found = await runRule(bufferOverflowRule, 'cpp', code);
  assert.equal(found.length, 3);
});

test('IED-S015 flags a constant out-of-bounds index (c)', async () => {
  const code = `void f(){ char b[8]; b[10] = 0; }`;
  const found = await runRule(bufferOverflowRule, 'c', code);
  assert.equal(found.length, 1);
  assert.equal(found[0].data?.kind, 'index');
  assert.equal(found[0].data?.index, 10);
  assert.equal(found[0].data?.size, 8);
});

test('IED-S015 ignores in-bounds index and safe copies (c)', async () => {
  const code = `void f(char *s){ char b[8]; b[2] = 0; strncpy(b, s, 7); }`;
  const found = await runRule(bufferOverflowRule, 'c', code);
  assert.equal(found.length, 0);
});

// ── IED-S016 format-string ───────────────────────────────────────────────────

test('IED-S016 flags printf with variable format (c)', async () => {
  const code = `void f(char *m){ printf(m); }`;
  const found = await runRule(formatStringRule, 'c', code);
  assert.equal(found.length, 1);
  assert.equal(found[0].ruleId, 'IED-S016');
  assert.equal(found[0].severity, Severity.Error);
});

test('IED-S016 flags fprintf/sprintf/snprintf at their format slot (cpp)', async () => {
  const code = `void f(char *m, char *b){ fprintf(stderr, m); sprintf(b, m); snprintf(b, 8, m); }`;
  const found = await runRule(formatStringRule, 'cpp', code);
  assert.equal(found.length, 3);
});

test('IED-S016 ignores literal format strings (c)', async () => {
  const code = `void f(char *m){ printf("%s", m); fprintf(stderr, "%s", m); }`;
  const found = await runRule(formatStringRule, 'c', code);
  assert.equal(found.length, 0);
});

// ── IED-R010 use-after-free ──────────────────────────────────────────────────

test('IED-R010 flags deref after free (c)', async () => {
  const code = `void f(int *p){ free(p); *p = 1; }`;
  const found = await runRule(useAfterFreeRule, 'c', code);
  assert.equal(found.length, 1);
  assert.equal(found[0].ruleId, 'IED-R010');
  assert.equal(found[0].data?.variable, 'p');
});

test('IED-R010 flags use after delete (cpp)', async () => {
  const code = `void f(int *p){ delete p; int x = *p; (void)x; }`;
  const found = await runRule(useAfterFreeRule, 'cpp', code);
  assert.equal(found.length, 1);
  assert.equal(found[0].data?.variable, 'p');
});

test('IED-R010 ignores reassignment after free (c)', async () => {
  const code = `void f(int *p){ free(p); p = 0; *p = 1; }`;
  const found = await runRule(useAfterFreeRule, 'c', code);
  assert.equal(found.length, 0);
});

test('IED-R010 ignores free with no later use (cpp)', async () => {
  const code = `void f(int *p){ delete p; }`;
  const found = await runRule(useAfterFreeRule, 'cpp', code);
  assert.equal(found.length, 0);
});

// ── IED-L017 integer-overflow ────────────────────────────────────────────────

test('IED-L017 flags malloc(n * sizeof) with non-constant operand (c)', async () => {
  const code = `void f(int n){ char *p = malloc(n * sizeof(int)); (void)p; }`;
  const found = await runRule(integerOverflowRule, 'c', code);
  assert.equal(found.length, 1);
  assert.equal(found[0].ruleId, 'IED-L017');
  assert.equal(found[0].severity, Severity.Info);
});

test('IED-L017 flags calloc size multiply (cpp)', async () => {
  const code = `void f(int n, int w){ char *p = (char *)calloc(1, n * w); (void)p; }`;
  const found = await runRule(integerOverflowRule, 'cpp', code);
  assert.equal(found.length, 1);
});

test('IED-L017 ignores constant size computations (c)', async () => {
  const code = `void f(){ char *p = malloc(4 * 8); (void)p; }`;
  const found = await runRule(integerOverflowRule, 'c', code);
  assert.equal(found.length, 0);
});

test('IED-L017 ignores multiply outside an allocator (c)', async () => {
  const code = `void f(int n, int w){ int area = n * w; (void)area; }`;
  const found = await runRule(integerOverflowRule, 'c', code);
  assert.equal(found.length, 0);
});

// ── IED-Q016 printf-left ─────────────────────────────────────────────────────

test('IED-Q016 flags bare printf (c)', async () => {
  const code = `void f(int x){ printf("x=%d\\n", x); }`;
  const found = await runRule(printfLeftRule, 'c', code);
  assert.equal(found.length, 1);
  assert.equal(found[0].ruleId, 'IED-Q016');
});

test('IED-Q016 flags std::cout chain once (cpp)', async () => {
  const code = `void f(int x){ std::cout << "x=" << x << "\\n"; }`;
  const found = await runRule(printfLeftRule, 'cpp', code);
  assert.equal(found.length, 1);
  assert.equal(found[0].data?.kind, 'std::cout');
});

test('IED-Q016 flags fprintf(stderr) and puts (c)', async () => {
  const code = `void f(){ fprintf(stderr, "boom"); puts("hi"); }`;
  const found = await runRule(printfLeftRule, 'c', code);
  assert.equal(found.length, 2);
});

test('IED-Q016 is relaxed inside test files (c)', async () => {
  const code = `void f(){ printf("hi"); }`;
  const found = await runRule(printfLeftRule, 'c', code, { isTestFile: true });
  assert.equal(found.length, 0);
});

// ── fixtures: whole-file sanity for bad and good sources ─────────────────────

test('c-family fixtures: bad.c fires every rule', async () => {
  const code = fixture('bad.c');
  const rules = [bufferOverflowRule, formatStringRule, useAfterFreeRule, integerOverflowRule, printfLeftRule];
  for (const rule of rules) {
    const found = await runRule(rule, 'c', code);
    assert.ok(found.length >= 1, `${rule.id} expected to fire on bad.c`);
  }
});

test('c-family fixtures: good.c is clean', async () => {
  const code = fixture('good.c');
  const rules = [bufferOverflowRule, formatStringRule, useAfterFreeRule, integerOverflowRule, printfLeftRule];
  for (const rule of rules) {
    const found = await runRule(rule, 'c', code);
    assert.equal(found.length, 0, `${rule.id} should not fire on good.c`);
  }
});

test('c-family fixtures: bad.cpp fires every rule', async () => {
  const code = fixture('bad.cpp');
  const rules = [bufferOverflowRule, formatStringRule, useAfterFreeRule, integerOverflowRule, printfLeftRule];
  for (const rule of rules) {
    const found = await runRule(rule, 'cpp', code);
    assert.ok(found.length >= 1, `${rule.id} expected to fire on bad.cpp`);
  }
});

test('c-family fixtures: good.cpp is clean', async () => {
  const code = fixture('good.cpp');
  const rules = [bufferOverflowRule, formatStringRule, useAfterFreeRule, integerOverflowRule, printfLeftRule];
  for (const rule of rules) {
    const found = await runRule(rule, 'cpp', code);
    assert.equal(found.length, 0, `${rule.id} should not fire on good.cpp`);
  }
});
