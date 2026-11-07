/**
 * IED-T010 — null-assertion (Dart)
 *
 * Flags the postfix null-assertion operator `!` (`user!.name`, `map['k']!`,
 * `snapshot.data!`). It converts a nullable value to non-nullable by throwing
 * a `TypeError` at runtime when the value is null — the null-safety escape
 * hatch most likely to crash a Flutter app in production.
 *
 * In the Dart grammar the operator is a `selector` whose entire text is `!`.
 * Prefer a null check, `?.`, `??`, or a pattern/if-case that promotes the type.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

/**
 * Source text of the expression `!` applies to. Dart chains are flat siblings
 * (`cache` `[id]` `!`), so collect the selectors before the `!` back to the
 * primary expression they hang off.
 */
function assertedExpression(bang: TSNode): string | null {
  const parts: string[] = [];
  let cur = bang.previousSibling;
  while (cur && cur.type === 'selector') {
    parts.unshift(cur.text);
    cur = cur.previousSibling;
  }
  if (cur && cur.isNamed) parts.unshift(cur.text);
  return parts.length > 0 ? parts.join('') : null;
}

export const dartNullAssertionRule: Rule = {
  id: 'IED-T010',
  name: 'null-assertion',
  category: 'type-safety',
  severity: Severity.Warning,
  languages: ['dart'],
  description: 'Null-assertion operator `!` throws at runtime when the value is null.',
  docs: [
    '# null-assertion (IED-T010)',
    '',
    'The postfix `!` operator tells the compiler "this is never null" and throws',
    'a TypeError when it is. Check for null, use `?.` / `??`, or promote the',
    'value with a local variable or pattern instead.',
    '',
    '```dart',
    'final name = user!.name;          // flagged',
    "final name = user?.name ?? 'guest'; // ok",
    '```'
  ].join('\n'),

  nodeTypes: () => ['selector'],

  run(ctx: RuleContext): void {
    for (const selector of ctx.nodesOfType('selector')) {
      // Cheap length check first; `.text` is only read for 1-char selectors.
      if (selector.endIndex - selector.startIndex !== 1 || selector.text !== '!') continue;
      if (ctx.isSuppressed(selector.startPosition.row, 'IED-T010')) continue;
      const target = assertedExpression(selector);
      ctx.report({
        message: target
          ? `Null assertion on "${target.slice(0, 40)}" throws if it is null — check or use ?. / ?? instead.`
          : 'Null assertion `!` throws if the value is null — check or use ?. / ?? instead.',
        severity: Severity.Warning,
        range: nodeRange(selector)
      });
    }
  }
};
