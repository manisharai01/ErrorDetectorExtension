/**
 * IED-R005 — open-without-context
 *
 * Flags `open(...)` whose result is stored in a variable rather than used in a
 * `with` statement. Without a context manager the file may never be closed,
 * leaking a file descriptor (especially on a raised exception).
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

function isOpenCall(node: TSNode): boolean {
  if (node.type !== 'call') return false;
  const fn = node.childForFieldName('function');
  return !!fn && fn.type === 'identifier' && fn.text === 'open';
}

export const openWithoutContextRule: Rule = {
  id: 'IED-R005',
  name: 'open-without-context',
  category: 'resource',
  severity: Severity.Warning,
  languages: ['python'],
  description: '`open()` result assigned without a `with` context manager.',
  docs: [
    '# open-without-context (IED-R005)',
    '',
    'Assigning `open(...)` to a variable risks leaking the file descriptor if the',
    'code raises before `.close()`.',
    '',
    '```py',
    'f = open("data.txt")   # flagged',
    '',
    'with open("data.txt") as f:   # fixed',
    '    ...',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    // We only flag `open()` calls that are the RHS of an assignment. Calls used
    // as the context expression of a `with` statement are nested inside
    // with_item/as_pattern, never an `assignment`, so they are naturally excluded.
    const walk = (node: TSNode): void => {
      if (node.type === 'assignment') {
        const right = node.childForFieldName('right');
        if (right && isOpenCall(right)) {
          if (!ctx.isSuppressed(right.startPosition.row, 'IED-R005')) {
            ctx.report({
              message: 'Use `with open(...) as f:` to guarantee close.',
              severity: Severity.Warning,
              range: nodeRange(right)
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
