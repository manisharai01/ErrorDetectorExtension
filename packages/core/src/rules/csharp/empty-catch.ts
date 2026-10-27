/**
 * IED-L019 — empty-catch (C#)
 *
 * A `catch` block with no statements silently swallows the exception: the
 * error disappears, no logging, no rethrow, no recovery. This hides bugs and
 * makes failures impossible to diagnose. This rule flags a `catch_clause`
 * whose body `block` contains no statements (only the `{` and `}` tokens).
 *
 * Structure: `(catch_clause ... body: (block))` — an empty block has no named
 * children.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

/** The block belonging to a catch_clause (field `body`, else a direct child). */
function catchBody(node: TSNode): TSNode | null {
  const byField = node.childForFieldName('body');
  if (byField && byField.type === 'block') return byField;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === 'block') return child;
  }
  return null;
}

/** True if a block has no statements (only punctuation tokens). */
function isEmptyBlock(block: TSNode): boolean {
  return block.namedChildCount === 0;
}

export const emptyCatchRule: Rule = {
  id: 'IED-L019',
  name: 'empty-catch',
  category: 'logic',
  severity: Severity.Warning,
  languages: ['csharp'],
  description: 'Flags empty catch blocks that silently swallow exceptions.',
  docs: [
    '# empty-catch (IED-L019)',
    '',
    'An empty `catch` block discards the exception silently — no logging, no',
    'rethrow, no recovery — so failures become invisible.',
    '',
    '```csharp',
    'try { Save(); }',
    'catch (Exception e) { } // flagged — exception swallowed',
    '```',
    '',
    'At minimum log the exception, or rethrow if you cannot handle it.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (node.type === 'catch_clause') {
        const body = catchBody(node);
        if (body && isEmptyBlock(body)) {
          if (!ctx.isSuppressed(node.startPosition.row, 'IED-L019')) {
            ctx.report({
              message: 'Empty catch block swallows the exception; log it or rethrow.',
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
