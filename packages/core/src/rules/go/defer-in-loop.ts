/**
 * IED-R006 — defer-in-loop (Go)
 *
 * `defer` runs when the enclosing *function* returns, not at the end of a loop
 * iteration. Putting `defer` inside a loop accumulates deferred calls (open
 * files, locks, connections) until the function exits — often a resource leak.
 *
 * We walk parents from each `defer_statement`: if we reach a `for_statement`
 * before the enclosing function body boundary, it's a defer inside a loop.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const FUNCTION_BOUNDARY = new Set([
  'function_declaration',
  'method_declaration',
  'func_literal'
]);

export const deferInLoopRule: Rule = {
  id: 'IED-R006',
  name: 'defer-in-loop',
  category: 'resource',
  severity: Severity.Warning,
  languages: ['go'],
  description: 'A defer statement inside a loop accumulates until function return.',
  docs: [
    '# defer-in-loop (IED-R006)',
    '',
    '`defer` fires at function return, not at the end of each iteration:',
    '',
    '```go',
    'for _, p := range paths {',
    '    f, _ := os.Open(p)',
    '    defer f.Close() // flagged: all files stay open until f() returns',
    '}',
    '```',
    '',
    'Move the work into a helper function, or close explicitly inside the loop.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (node.type === 'defer_statement') {
        // Walk up: a for_statement before any function boundary means in-loop.
        let cur: TSNode | null = node.parent;
        while (cur) {
          if (cur.type === 'for_statement') {
            if (!ctx.isSuppressed(node.startPosition.row, 'IED-R006')) {
              ctx.report({
                message:
                  'defer inside loop accumulates until the function returns; ' +
                  'close the resource each iteration or use a helper function.',
                severity: Severity.Warning,
                range: nodeRange(node)
              });
            }
            break;
          }
          if (FUNCTION_BOUNDARY.has(cur.type)) break;
          cur = cur.parent;
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
