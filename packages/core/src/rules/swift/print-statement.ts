/**
 * IED-Q015 — print-statement (Swift)
 *
 * `print(...)` / `debugPrint(...)` calls left in shipping code leak diagnostic
 * noise to the console, can expose sensitive data, and cost a little runtime.
 * They are fine in tests, so this rule is silent in test files.
 *
 * NODE SHAPE (verified against tree-sitter-swift):
 *   `print("x")` -> (call_expression (simple_identifier) (call_suffix ...))
 * The callee is a bare `simple_identifier`. A member call such as
 * `logger.print()` has a `navigation_expression` callee instead, so it is not
 * matched.
 *
 * NOTE: id is IED-Q015 (IED-Q012 is taken by the Rust `dbg!` rule).
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const PRINT_FUNCS = new Set(['print', 'debugPrint']);

export const printStatementRule: Rule = {
  id: 'IED-Q015',
  name: 'print-statement',
  category: 'quality',
  severity: Severity.Warning,
  languages: ['swift'],
  description: 'Leftover `print()` / `debugPrint()` call.',
  docs: [
    '# print-statement (IED-Q015)',
    '',
    'Diagnostic `print()` / `debugPrint()` calls should not ship:',
    '',
    '```swift',
    'print("got here", user.token) // flagged',
    '```',
    '',
    'Use a real logging facility (`os.Logger`, `OSLog`) gated by build config',
    'instead. This rule is silent in test files.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    if (ctx.isTestFile) return;

    const walk = (node: TSNode): void => {
      if (node.type === 'call_expression') {
        const callee = node.child(0);
        if (
          callee &&
          callee.type === 'simple_identifier' &&
          PRINT_FUNCS.has(callee.text)
        ) {
          if (!ctx.isSuppressed(node.startPosition.row, 'IED-Q015')) {
            ctx.report({
              message: 'Remove print() before shipping.',
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
