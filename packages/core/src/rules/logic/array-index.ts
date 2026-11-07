/**
 * IED-L001 — array-index
 *
 * Heuristic detection of off-by-one indexing patterns:
 *   - `arr[arr.length]` — always returns `undefined`.
 *   - `for (...; i <= arr.length; ...)` — iterates one past the end.
 *
 * Ported from the legacy `logic/array-index` rule (TypeScript compiler API) to
 * Tree-sitter. Reads subscript expressions and for-loops from the shared node
 * index; the "same identifier on both sides" check compares node text.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext
} from '../types';

export const arrayIndexRule: Rule = {
  id: 'IED-L001',
  name: 'array-index',
  category: 'logic',
  severity: Severity.Error,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue'],
  description: 'Detects suspicious indexing such as arr[arr.length] and <= arr.length loop bounds.',
  docs: [
    '# array-index (IED-L001)',
    '',
    'Flags two common off-by-one mistakes:',
    '',
    '```js',
    'arr[arr.length];            // always undefined',
    'for (let i = 0; i <= arr.length; i++) {}  // iterates one past the end',
    '```',
    '',
    'Use `arr[arr.length - 1]` for the last element, and `<` instead of `<=`',
    'when iterating up to a length.'
  ].join('\n'),

  nodeTypes: () => ['subscript_expression', 'for_statement'],

  run(ctx: RuleContext): void {
    // --- Pattern 1: arr[arr.length] ---
    // subscript_expression { object: identifier X, index: member_expression { object: identifier X, property: "length" } }
    for (const subscript of ctx.nodesOfType('subscript_expression')) {
      const arr = subscript.childForFieldName('object');
      if (!arr || arr.type !== 'identifier') continue;
      const index = subscript.childForFieldName('index');
      if (!index || index.type !== 'member_expression') continue;
      const arr2 = index.childForFieldName('object');
      const prop = index.childForFieldName('property');
      if (!arr2 || arr2.type !== 'identifier') continue;
      if (!prop || prop.type !== 'property_identifier' || prop.text !== 'length') continue;
      // Cross-capture equality: same identifier on both sides.
      if (arr.text !== arr2.text) continue;
      if (ctx.isSuppressed(subscript.startPosition.row, 'IED-L001')) continue;
      ctx.report({
        message: `Indexing with \`${arr.text}[${arr.text}.length]\` always returns undefined.`,
        severity: Severity.Error,
        range: nodeRange(subscript),
        data: { kind: 'subscript', array: arr.text }
      });
    }

    // --- Pattern 2: for (...; i <= arr.length; ...) ---
    // The for_statement's `condition` field wraps the test in an
    // expression_statement, which contains the binary_expression.
    for (const loop of ctx.nodesOfType('for_statement')) {
      const condition = loop.childForFieldName('condition');
      if (!condition || condition.type !== 'expression_statement') continue;
      const cond = condition.namedChild(0);
      if (!cond || cond.type !== 'binary_expression') continue;
      const op = cond.childForFieldName('operator');
      if (!op || op.text !== '<=') continue;
      const right = cond.childForFieldName('right');
      if (!right || right.type !== 'member_expression') continue;
      const prop = right.childForFieldName('property');
      if (!prop || prop.type !== 'property_identifier' || prop.text !== 'length') continue;
      if (ctx.isSuppressed(cond.startPosition.row, 'IED-L001')) continue;
      ctx.report({
        message: 'Loop bound uses `<= .length` which iterates one past the end (off-by-one).',
        severity: Severity.Error,
        range: nodeRange(cond),
        data: { kind: 'loop-bound' }
      });
    }
  }
};
