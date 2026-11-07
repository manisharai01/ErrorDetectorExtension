/**
 * Whole-program checks: import cycles (JS/TS + Python), broken imports,
 * duplicates across files, and the combined `runProjectChecks` diagnostics.
 * Files are virtual (paths under a directory that does not exist on disk), so a
 * specifier that is not in the set also does not exist on disk.
 */
import * as assert from 'assert';
import * as path from 'path';
import { test, parser } from './harness';
import { findImportCycles, findBrokenImports } from '../src/engine/module-graph';
import { findDuplicateFunctions } from '../src/engine/duplicates';
import { runProjectChecks } from '../src/engine/project-checks';

const root = path.resolve(__dirname, '__virtual_project__');
const file = (rel: string, content: string) => ({ filePath: path.join(root, rel), content });
const base = (p: string) => path.relative(root, p).split(path.sep).join('/');

test('findImportCycles finds a JS/TS cycle and names the import that closes it', async () => {
  const cycles = await findImportCycles(
    [
      file('a.ts', 'import { b } from "./b";\nexport const a = () => b();'),
      file('b.ts', 'import { c } from "./c";\nexport const b = () => c();'),
      file('c.ts', 'import { a } from "./a";\nexport const c = () => a();'),
      file('d.ts', 'import { a } from "./a";')
    ],
    parser()
  );
  assert.strictEqual(cycles.length, 1);
  assert.deepStrictEqual(cycles[0].files.map(base), ['a.ts', 'b.ts', 'c.ts']);
  assert.strictEqual(cycles[0].edges[2].location.start.row, 0);
});

test('findImportCycles ignores type-only imports, dynamic import() and requires inside functions', async () => {
  const cycles = await findImportCycles(
    [
      file('a.ts', 'import type { B } from "./b";\nexport interface A { b: B }'),
      file('b.ts', 'import { A } from "./a";\nexport interface B { a: A }'),
      file('c.js', 'const d = require("./d");\nmodule.exports = { d };'),
      file('d.js', 'function late() { return require("./c"); }\nconst x = import("./c");\nmodule.exports = { late };')
    ],
    parser()
  );
  assert.strictEqual(cycles.length, 0, JSON.stringify(cycles.map((c) => c.files.map(base))));
});

test('findImportCycles resolves Python relative and absolute package imports', async () => {
  const cycles = await findImportCycles(
    [
      file('app/__init__.py', ''),
      file('app/models.py', 'from .services import notify\nclass User: pass\n'),
      file('app/services.py', 'from app.models import User\ndef notify(u): pass\n'),
      file('app/views.py', 'def handler():\n    from app import models\n'),
      file('app/types.py', 'from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n    from app.views import handler\n')
    ],
    parser()
  );
  assert.strictEqual(cycles.length, 1);
  assert.deepStrictEqual(cycles[0].files.map(base).sort(), ['app/models.py', 'app/services.py']);
});

test('findBrokenImports reports missing files, missing names and missing default exports', async () => {
  const broken = await findBrokenImports(
    [
      file('src/api.ts', 'export function getUser() {}\nexport type User = { id: string };'),
      file(
        'src/page.ts',
        [
          'import { getUser, getUsers } from "./api";',
          'import api from "./api";',
          'import type { User } from "./api";',
          'import { helper } from "./missing-helper";',
          'import "./styles.css";',
          'import { x } from "some-package";'
        ].join('\n')
      )
    ],
    parser()
  );
  const summary = broken.map((b) => `${b.kind}:${b.name ?? b.specifier}`).sort();
  assert.deepStrictEqual(summary, [
    'missing-export:default',
    'missing-export:getUsers',
    'missing-module:./missing-helper',
    'missing-module:./styles.css'
  ]);
});

test('findBrokenImports trusts modules whose exports it cannot enumerate', async () => {
  const broken = await findBrokenImports(
    [
      file('lib/index.ts', 'export * from "./impl";'),
      file('lib/impl.ts', 'export const impl = 1;'),
      file('lib/legacy.js', 'module.exports = { old: 1 };'),
      file('lib/use.ts', 'import { anything } from "./index";\nimport { old } from "./legacy";\nimport { impl } from "./impl.js";')
    ],
    parser()
  );
  assert.strictEqual(broken.length, 0, JSON.stringify(broken));
});

test('findDuplicateFunctions groups copies across files and folds nested functions', async () => {
  const body = (v: string) =>
    `{\n  let total = 0;\n  for (const ${v} of items) {\n    if (${v}.price > 0 && ${v}.qty > 0) {\n      total += ${v}.price * ${v}.qty;\n    }\n  }\n  return Math.round(total * 100) / 100;\n}`;
  const groups = await findDuplicateFunctions(
    [
      file('cart.ts', `export function cartTotal(items) ${body('item')}`),
      file('invoice.ts', `export function invoiceTotal(items) ${body('line')}`),
      file('report.py', 'def total(items):\n    return sum(i.price for i in items)\n')
    ],
    { parser: parser() }
  );
  assert.strictEqual(groups.length, 1);
  assert.deepStrictEqual(groups[0].functions.map((f) => f.name).sort(), ['cartTotal', 'invoiceTotal']);
});

test('runProjectChecks returns every finding as an IED-X diagnostic', async () => {
  const report = await runProjectChecks(
    [
      file('x.ts', 'import { y } from "./y";\nexport const x = 1;\nexport const unused = 2;'),
      file('y.ts', 'import { x, nope } from "./x";\nexport const y = x;')
    ],
    { parser: parser(), checks: ['cycles', 'broken-imports', 'unused-exports'] }
  );
  const ids = report.diagnostics.map((d) => d.ruleId).sort();
  assert.deepStrictEqual(ids, ['IED-X001', 'IED-X001', 'IED-X002', 'IED-X004']);
  const cycle = report.diagnostics.find((d) => d.ruleId === 'IED-X001')!;
  assert.ok(cycle.message.includes('→'), cycle.message);
  assert.ok(report.diagnostics.every((d) => d.fingerprint.length === 16));
});
