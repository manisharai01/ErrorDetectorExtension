/**
 * IED-T008 — force-unwrap (Swift)
 *
 * The force-unwrap operator `!` (e.g. `value!`) unwraps an Optional and traps
 * (crashes) at runtime if the value is `nil`. It discards the compile-time
 * safety Optionals are designed to provide. Safer alternatives express the
 * same intent without risking a crash: `if let` / `guard let` binding, or the
 * nil-coalescing operator `??`.
 *
 * NODE SHAPE (verified against tree-sitter-swift):
 *   `a!`    -> (postfix_expression target: (simple_identifier) operation: (bang))
 *   `b!.c`  -> (navigation_expression target: (postfix_expression ... (bang)) ...)
 *   `try! foo()` is a *different* shape: (try_expression (try_operator) ...),
 *   NOT a postfix bang, so flagging the postfix bang naturally skips `try!`.
 *
 * We walk the tree and flag any `postfix_expression` whose `operation` child
 * is a `bang` token.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

export const forceUnwrapRule: Rule = {
  id: 'IED-T008',
  name: 'force-unwrap',
  category: 'type-safety',
  severity: Severity.Warning,
  languages: ['swift'],
  description: 'Use of the force-unwrap operator `!` on an Optional.',
  docs: [
    '# force-unwrap (IED-T008)',
    '',
    'The force-unwrap operator `!` traps (crashes) at runtime if the value is',
    '`nil`, throwing away Swift Optional safety:',
    '',
    '```swift',
    'let len = name!.count // flagged — crashes if name is nil',
    '```',
    '',
    'Prefer optional binding or nil-coalescing:',
    '',
    '```swift',
    'if let name = name { /* use name */ }',
    'guard let name = name else { return }',
    'let len = name?.count ?? 0',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (node.type === 'postfix_expression') {
        const op = node.childForFieldName('operation');
        if (op && op.type === 'bang') {
          if (!ctx.isSuppressed(node.startPosition.row, 'IED-T008')) {
            ctx.report({
              message:
                'Force unwrap may crash on nil; use if let / guard let / ??.',
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
