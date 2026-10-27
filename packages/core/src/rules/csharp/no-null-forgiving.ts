/**
 * IED-T009 — no-null-forgiving (C#)
 *
 * The null-forgiving (null-suppression) operator `x!` tells the compiler to
 * stop tracking null-state for an expression. It suppresses the warning but
 * does nothing at runtime: if the value really is null, you still get a
 * `NullReferenceException`, only now with the compiler's help removed. Prefer a
 * real null check, a nullable annotation, or a guard clause.
 *
 * The node is a `postfix_unary_expression` whose final child is the `!` token
 * (e.g. `(postfix_unary_expression (identifier) !)`).
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

export const noNullForgivingRule: Rule = {
  id: 'IED-T009',
  name: 'no-null-forgiving',
  category: 'type-safety',
  severity: Severity.Warning,
  languages: ['csharp'],
  description: 'Flags the null-forgiving operator `x!`.',
  docs: [
    '# no-null-forgiving (IED-T009)',
    '',
    'The null-forgiving operator `!` silences the compiler without any runtime',
    'check, so a genuinely-null value still throws `NullReferenceException`.',
    '',
    '```csharp',
    'var name = user!.Name; // flagged — suppresses null-state, no runtime guard',
    '```',
    '',
    'Prefer an explicit null check, a nullable annotation, or a guard clause.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (node.type === 'postfix_unary_expression') {
        const last = node.child(node.childCount - 1);
        if (last && last.text === '!') {
          if (!ctx.isSuppressed(node.startPosition.row, 'IED-T009')) {
            ctx.report({
              message: 'Avoid the null-forgiving operator `!`; it suppresses null checks without a runtime guard.',
              severity: Severity.Warning,
              range: nodeRange(node)
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
