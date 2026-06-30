/**
 * IED-T004 — not-null-assertion (Kotlin)
 *
 * The `!!` operator forcibly unwraps a nullable value, throwing
 * `NullPointerException` if it is null. It throws away Kotlin's compile-time
 * null-safety and is almost always a code smell — a safe call (`?.`), an
 * Elvis fallback (`?:`), or an explicit null check expresses intent without
 * risking a crash.
 *
 * NODE SHAPE (verified against the tree-sitter-kotlin grammar):
 *   `a!!`     -> (postfix_expression (simple_identifier) ("!!"))
 *   `a!!.b`   -> (navigation_expression (postfix_expression ... ("!!")) ...)
 * The `!!` is an *anonymous* token (node.type === '!!') sitting inside a
 * `postfix_expression`. We walk the tree and flag any `postfix_expression`
 * that has a direct `!!` child, reporting once per occurrence.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

export const notNullAssertionRule: Rule = {
  id: 'IED-T004',
  name: 'not-null-assertion',
  category: 'type-safety',
  severity: Severity.Warning,
  languages: ['kotlin'],
  description: 'Use of the `!!` non-null assertion operator.',
  docs: [
    '# not-null-assertion (IED-T004)',
    '',
    'The `!!` operator unwraps a nullable value and throws',
    '`NullPointerException` if it is null, discarding Kotlin null-safety:',
    '',
    '```kotlin',
    'val len = name!!.length // flagged — crashes if name is null',
    '```',
    '',
    'Prefer a safe call, an Elvis operator, or an explicit check:',
    '',
    '```kotlin',
    'val len = name?.length ?: 0',
    'if (name != null) { /* use name */ }',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (node.type === 'postfix_expression') {
        // A postfix_expression is the `!!` form only when it has a direct
        // `!!` token child (other postfix operators do not exist in Kotlin,
        // but we check explicitly to stay robust).
        let bangBang: TSNode | undefined;
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child && child.type === '!!') {
            bangBang = child;
            break;
          }
        }
        if (bangBang && !ctx.isSuppressed(node.startPosition.row, 'IED-T004')) {
          ctx.report({
            message: 'Avoid `!!` — use `?.`, `?:`, or an explicit null check.',
            severity: Severity.Warning,
            range: nodeRange(node)
          });
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
