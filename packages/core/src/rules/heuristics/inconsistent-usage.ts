/**
 * IED-H003 — inconsistent-usage
 *
 * The same variable is used as an array AND as a plain object inside one
 * function — e.g. `data.map(…)` on one line and `data.items` on another. One of
 * the two is wrong for the value it actually holds, which surfaces at runtime
 * as "x.map is not a function" or a silent `undefined`. Typical cause: an API
 * response that is sometimes the list and sometimes `{ items: [...] }`.
 * Ported from the legacy `heuristics/inconsistent-usage` rule, with tighter
 * signals to keep noise down:
 *
 *   - array usage: a numeric index (`x[0]`) or a call to an array-only method
 *     (`push`, `map`, `filter`, `reduce`, `join`, …);
 *   - object usage: reading a property that no array has (`x.items`), not a
 *     method call and not `length`/`size`.
 *
 * Library namespaces (`_`, `$`, capitalised names) and `this` are skipped.
 * Each variable is reported once per function, at its first object-style use.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';
import { EnclosingStack, JS_FUNCTION_TYPES, spanOf } from '../util';

/** Methods that (practically) only arrays have. */
const ARRAY_ONLY_METHODS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'flat',
  'flatMap',
  'reduce',
  'reduceRight',
  'findIndex',
  'findLastIndex',
  'join',
  'map',
  'filter',
  'some',
  'every'
]);

/** Properties arrays, strings, Maps and Sets all have — never an object signal. */
const BUILTIN_MEMBERS = new Set([
  'length',
  'size',
  'constructor',
  'prototype',
  ...ARRAY_ONLY_METHODS,
  'concat',
  'slice',
  'indexOf',
  'lastIndexOf',
  'includes',
  'find',
  'findLast',
  'forEach',
  'sort',
  'reverse',
  'fill',
  'keys',
  'values',
  'entries',
  'at',
  'toString'
]);

const SKIPPED_NAMES = new Set(['_', '$', 'this', 'self', 'window', 'document', 'console', 'process', 'module', 'exports']);

interface Usage {
  arrayVia: string | null;
  objectAt: TSNode | null;
  objectProp: string | null;
}

export const inconsistentUsageRule: Rule = {
  id: 'IED-H003',
  name: 'inconsistent-usage',
  category: 'logic',
  severity: Severity.Info,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue'],
  description: 'A variable is used both as an array and as an object in one function.',
  docs: [
    '# inconsistent-usage (IED-H003)',
    '',
    'Using one variable as both an array and an object usually means one of the',
    'two accesses is wrong for the value it really holds:',
    '',
    '```js',
    'function render(data) {',
    '  const total = data.total;     // flagged — object access …',
    '  return data.map(row);         // … but used as an array here',
    '}',
    '```',
    '',
    'Normalise the value once (e.g. `const rows = Array.isArray(data) ? data :',
    'data.items;`) and use the right name for each shape.'
  ].join('\n'),

  nodeTypes: () => [...JS_FUNCTION_TYPES, 'member_expression', 'subscript_expression'],

  run(ctx: RuleContext): void {
    const functions: Array<Map<string, Usage>> = [];
    const scopes = new EnclosingStack<Map<string, Usage>>();

    for (const node of ctx.nodesOfType([...JS_FUNCTION_TYPES, 'member_expression', 'subscript_expression'])) {
      scopes.at(spanOf(node));
      if (node.type !== 'member_expression' && node.type !== 'subscript_expression') {
        const usage = new Map<string, Usage>();
        functions.push(usage);
        scopes.push(spanOf(node), usage);
        continue;
      }
      const usage = scopes.innermost();
      if (!usage) continue;
      const object = node.childForFieldName('object');
      if (!object || object.type !== 'identifier') continue;
      const name = object.text;
      if (SKIPPED_NAMES.has(name) || /^[A-Z]/.test(name)) continue;

      const entry = usage.get(name) ?? { arrayVia: null, objectAt: null, objectProp: null };
      if (node.type === 'subscript_expression') {
        if (node.childForFieldName('index')?.type === 'number') entry.arrayVia ??= `${name}[…]`;
      } else {
        const prop = node.childForFieldName('property');
        if (!prop || prop.type !== 'property_identifier') continue;
        const parent = node.parent;
        const called =
          parent?.type === 'call_expression' &&
          parent.childForFieldName('function')?.startIndex === node.startIndex;
        if (called) {
          if (ARRAY_ONLY_METHODS.has(prop.text)) entry.arrayVia ??= `.${prop.text}()`;
        } else if (!BUILTIN_MEMBERS.has(prop.text) && entry.objectAt === null) {
          entry.objectAt = node;
          entry.objectProp = prop.text;
        }
      }
      usage.set(name, entry);
    }

    for (const usage of functions) {
      for (const [name, u] of usage) {
        if (!u.arrayVia || !u.objectAt) continue;
        if (ctx.isSuppressed(u.objectAt.startPosition.row, 'IED-H003')) continue;
        ctx.report({
          message: `"${name}" is used as an array (${u.arrayVia}) and as an object (.${u.objectProp}) in this function — one of them is probably wrong.`,
          severity: Severity.Info,
          range: nodeRange(u.objectAt),
          data: { variable: name }
        });
      }
    }
  }
};
