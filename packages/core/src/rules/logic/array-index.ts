/**
 * IED-L001 — array-index
 *
 * Heuristic detection of off-by-one indexing patterns:
 *   - `arr[arr.length]` — always returns `undefined`.
 *   - `for (...; i <= arr.length; ...)` — iterates one past the end.
 *
 * Ported from the legacy `logic/array-index` rule (TypeScript compiler API) to
 * Tree-sitter. The "same identifier on both sides" check is done by comparing
 * node text in JS, since cross-capture query equality is unreliable.
 */

import {
  Severity,
  capture,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
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

  run(ctx: RuleContext): void {
    // --- Pattern 1: arr[arr.length] ---
    // subscript_expression { object: identifier X, index: member_expression { object: identifier X, property: "length" } }
    const subscriptMatches = ctx.query(`
      (subscript_expression
        object: (identifier) @arr
        index: (member_expression
          object: (identifier) @arr2
          property: (property_identifier) @prop)) @subscript
    `);
    for (const m of subscriptMatches) {
      const subscript = capture(m, 'subscript');
      const arr = capture(m, 'arr');
      const arr2 = capture(m, 'arr2');
      const prop = capture(m, 'prop');
      if (!subscript || !arr || !arr2 || !prop) continue;
      if (prop.text !== 'length') continue;
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
    const forMatches = ctx.query(`
      (for_statement
        condition: (expression_statement
          (binary_expression
            operator: _ @op
            right: (member_expression
              property: (property_identifier) @prop)) @cond)) @for
    `);
    for (const m of forMatches) {
      const cond = capture(m, 'cond');
      const op = capture(m, 'op');
      const prop = capture(m, 'prop');
      if (!cond || !op || !prop) continue;
      if (op.text !== '<=') continue;
      if (prop.text !== 'length') continue;
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
