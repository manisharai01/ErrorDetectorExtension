/**
 * IED-L005 — infinite-loop
 *
 * Flags a constant-true loop with no exit:
 *   - `while (true) { ... }` whose body has no break/return/throw.
 *   - `for (;;) { ... }`     whose body has no break/return/throw.
 *
 * Ported from the legacy `logic/infinite-loop` rule. The body is scanned with
 * `descendantsOfType` for any of the exit statements.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const EXIT_TYPES = ['break_statement', 'return_statement', 'throw_statement'] as const;

/** True if `body` contains any break/return/throw anywhere within it. */
function hasExit(body: TSNode): boolean {
  for (const type of EXIT_TYPES) {
    if (body.descendantsOfType(type).length > 0) return true;
  }
  return false;
}

/**
 * For a `while_statement`, true when its condition is the literal `true`. The
 * condition field is a `parenthesized_expression` wrapping the literal, so we
 * unwrap it.
 */
function isWhileTrue(node: TSNode): boolean {
  const cond = node.childForFieldName('condition');
  if (!cond) return false;
  if (cond.type === 'true') return true;
  if (cond.type === 'parenthesized_expression') {
    for (let i = 0; i < cond.namedChildCount; i++) {
      const c = cond.namedChild(i);
      if (c && c.type === 'true') return true;
    }
  }
  return false;
}

/**
 * For a `for_statement`, true when there is no loop condition. Tree-sitter
 * represents an omitted condition as an `empty_statement`, or the field is
 * absent entirely.
 */
function isForEver(node: TSNode): boolean {
  const cond = node.childForFieldName('condition');
  return !cond || cond.type === 'empty_statement';
}

export const infiniteLoopRule: Rule = {
  id: 'IED-L005',
  name: 'infinite-loop',
  category: 'logic',
  severity: Severity.Warning,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue'],
  description: 'A constant-true loop that has no break/return/throw inside.',
  docs: [
    '# infinite-loop (IED-L005)',
    '',
    'A `while (true)` or `for (;;)` with no break/return/throw inside runs',
    'forever:',
    '',
    '```js',
    'while (true) { doStuff(); } // never exits',
    '```',
    '',
    'Add a termination condition or an exit statement.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      let always = false;
      let body: TSNode | null = null;
      if (node.type === 'while_statement' && isWhileTrue(node)) {
        always = true;
        body = node.childForFieldName('body');
      } else if (node.type === 'for_statement' && isForEver(node)) {
        always = true;
        body = node.childForFieldName('body');
      }
      if (always && body && !hasExit(body)) {
        if (!ctx.isSuppressed(node.startPosition.row, 'IED-L005')) {
          ctx.report({
            message: 'Loop appears to run forever (no break/return/throw inside).',
            severity: Severity.Warning,
            range: nodeRange(node),
            data: { loop: node.type }
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
