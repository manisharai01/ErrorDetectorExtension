/**
 * IED-R007 — unsafe-without-comment (Rust)
 *
 * Every `unsafe` block silently opts out of Rust's safety guarantees, so the
 * convention (enforced by clippy's `undocumented_unsafe_blocks`) is to precede
 * each one with a `// SAFETY: ...` comment explaining why the operation is
 * sound. A missing justification is both a review red flag and a maintenance
 * hazard.
 *
 * Heuristic: flag an `unsafe_block` when the source line immediately above the
 * block's start row is not a comment mentioning "SAFETY"/"safety". We scan
 * upward over blank lines so a `// SAFETY:` comment separated by a blank line
 * still counts. We look at raw source text (via `ctx.lineAt`) rather than the
 * AST because the comment is a sibling token whose position relative to the
 * block is easiest to judge by line.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

/** Does this source line look like a comment that justifies safety? */
function isSafetyComment(line: string): boolean {
  const trimmed = line.trim();
  const isComment =
    trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
  return isComment && /safety/i.test(trimmed);
}

export const unsafeWithoutCommentRule: Rule = {
  id: 'IED-R007',
  name: 'unsafe-without-comment',
  category: 'resource',
  severity: Severity.Warning,
  languages: ['rust'],
  description: 'An unsafe block lacks a // SAFETY: justification comment.',
  docs: [
    '# unsafe-without-comment (IED-R007)',
    '',
    'Each `unsafe` block opts out of the compiler\'s safety checks, so it should',
    'document why it is sound:',
    '',
    '```rust',
    '// SAFETY: ptr is non-null and points to an initialized i32.',
    'unsafe { *ptr }',
    '```',
    '',
    'A block without such a comment is flagged:',
    '',
    '```rust',
    'unsafe { *ptr }  // flagged: no // SAFETY: justification',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (node.type === 'unsafe_block') {
        const startRow = node.startPosition.row;
        // Scan upward past blank lines for a justifying comment.
        let row = startRow - 1;
        let documented = false;
        while (row >= 0) {
          const line = ctx.lineAt(row);
          if (line.trim() === '') {
            row--;
            continue;
          }
          documented = isSafetyComment(line);
          break;
        }
        if (!documented) {
          if (!ctx.isSuppressed(startRow, 'IED-R007')) {
            ctx.report({
              message: 'unsafe block without a // SAFETY: justification.',
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
