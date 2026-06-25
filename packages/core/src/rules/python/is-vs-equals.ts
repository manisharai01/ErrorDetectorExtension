/**
 * IED-L013 — is-vs-equals
 *
 * Flags `is` / `is not` identity comparisons against numeric or string literals.
 * Identity (`is`) compares object identity, not value; `x is 5` only works by
 * accident of CPython's small-int/string interning and is unreliable. Use `==`.
 *
 * `is None`, `is True`, `is False` are correct (singletons) and never flagged.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const LITERAL_TYPES = new Set(['integer', 'float', 'string', 'concatenated_string']);

export const isVsEqualsRule: Rule = {
  id: 'IED-L013',
  name: 'is-vs-equals',
  category: 'logic',
  severity: Severity.Warning,
  languages: ['python'],
  description: 'Identity comparison (`is`) against a numeric or string literal.',
  docs: [
    '# is-vs-equals (IED-L013)',
    '',
    '`is` compares object identity, not value. `x is 5` happens to work for small',
    'ints only because CPython interns them; it is not guaranteed.',
    '',
    '```py',
    'if x is 5:        # flagged — use ==',
    'if name is "foo": # flagged — use ==',
    'if y is None:     # fine — None is a singleton',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (node.type === 'comparison_operator') {
        // Operator tokens are anonymous children whose type is `is` or `is not`.
        const usesIs = (() => {
          for (let i = 0; i < node.childCount; i++) {
            const c = node.child(i);
            if (c && !c.isNamed && (c.type === 'is' || c.type === 'is not')) return true;
          }
          return false;
        })();
        if (usesIs) {
          const operands = node.namedChildren;
          const hasLiteral = operands.some((o) => LITERAL_TYPES.has(o.type));
          if (hasLiteral && !ctx.isSuppressed(node.startPosition.row, 'IED-L013')) {
            ctx.report({
              message: 'Use `==` to compare values; `is` checks identity and is unreliable for numbers/strings.',
              severity: Severity.Warning,
              range: nodeRange(node)
            });
          }
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const c = node.child(i);
        if (c) walk(c);
      }
    };
    walk(ctx.tree.rootNode);
  }
};
