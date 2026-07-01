/**
 * IED-L018 — type-juggling (PHP)
 *
 * Flags loose-equality comparisons (`==` / `!=`). PHP's loose operators coerce
 * operands across types, producing surprising results (e.g. `"0e123" == "0"`,
 * `0 == "abc"` historically). Prefer the strict `===` / `!==` operators, which
 * compare type as well as value.
 *
 * Detection: a `binary_expression` whose `operator` field text is exactly `==`
 * or `!=`. The strict forms `===` / `!==` are distinct tokens and are skipped.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const LOOSE_OPS = new Set(['==', '!=']);

export const typeJugglingRule: Rule = {
  id: 'IED-L018',
  name: 'type-juggling',
  category: 'logic',
  severity: Severity.Warning,
  languages: ['php'],
  description: 'Loose equality (== / !=) is subject to PHP type juggling.',
  docs: [
    '# type-juggling (IED-L018)',
    '',
    "PHP's `==` and `!=` coerce operand types before comparing, which can yield",
    'unexpected matches. Use the strict `===` / `!==` operators to compare value',
    'and type together.',
    '',
    '```php',
    'if ($a == $b) {}  // flagged',
    'if ($a === $b) {} // ok',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (node.type === 'binary_expression') {
        const op = node.childForFieldName('operator');
        if (op && LOOSE_OPS.has(op.text)) {
          const row = node.startPosition.row;
          if (!ctx.isSuppressed(row, 'IED-L018')) {
            ctx.report({
              message: 'Use === / !== to avoid PHP type juggling.',
              severity: Severity.Warning,
              range: nodeRange(node),
              data: { operator: op.text }
            });
          }
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child);
      }
    };

    walk(ctx.tree.rootNode);
  }
};
