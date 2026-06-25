/**
 * IED-C008 — goroutine-leak (Go)
 *
 * A goroutine that loops forever receiving from a channel with no way to exit
 * (no `select` with a done/ctx case, no `return`/`break`) leaks: it lives for
 * the lifetime of the process even after its work is done.
 *
 * Conservative shape we flag:
 *   go func(){ for { <-ch } }()
 * i.e. a `go_statement` whose function is a `func_literal` whose body contains
 * an unbounded `for_statement` (no for_clause / range_clause condition) that
 * has neither a `select_statement` nor a `return`/`break` statement inside.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

/** True if the for is unbounded — `for { ... }` with no clause/condition. */
function isUnboundedFor(forNode: TSNode): boolean {
  // A bounded for has a for_clause or range_clause child before the body.
  for (let i = 0; i < forNode.namedChildCount; i++) {
    const c = forNode.namedChild(i);
    if (c && (c.type === 'for_clause' || c.type === 'range_clause')) return false;
  }
  return true;
}

/** True if any descendant of `node` has one of the given types. */
function containsType(node: TSNode, types: Set<string>): boolean {
  if (types.has(node.type)) return true;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && containsType(child, types)) return true;
  }
  return false;
}

const EXIT_TYPES = new Set(['select_statement', 'return_statement', 'break_statement']);
const RECEIVE_TYPES = new Set(['unary_expression', 'receive_statement']);

export const goroutineLeakRule: Rule = {
  id: 'IED-C008',
  name: 'goroutine-leak',
  category: 'concurrency',
  severity: Severity.Warning,
  languages: ['go'],
  description: 'Goroutine loops on a channel with no exit path and may leak.',
  docs: [
    '# goroutine-leak (IED-C008)',
    '',
    'A goroutine blocked forever on a channel receive never terminates:',
    '',
    '```go',
    'go func() {',
    '    for {',
    '        <-ch // no select-with-done, no return: leaks',
    '    }',
    '}()',
    '```',
    '',
    'Add a `select` with a `<-ctx.Done()` / done case, or a `return`/`break`.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const matches = ctx.query(`
      (go_statement
        (call_expression
          function: (func_literal body: (block) @body))) @go
    `);

    const reported = new Set<number>();

    for (const m of matches) {
      const go = m.captures.find((c) => c.name === 'go')?.node;
      const body = m.captures.find((c) => c.name === 'body')?.node;
      if (!go || !body) continue;

      // Find an unbounded for inside the goroutine body.
      const findUnboundedFor = (node: TSNode): TSNode | null => {
        if (node.type === 'for_statement' && isUnboundedFor(node)) return node;
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child) {
            // Don't descend into nested func literals; they're separate goroutines/closures.
            if (child.type === 'func_literal') continue;
            const r = findUnboundedFor(child);
            if (r) return r;
          }
        }
        return null;
      };

      const forNode = findUnboundedFor(body);
      if (!forNode) continue;

      const forBody = forNode.childForFieldName('body');
      if (!forBody) continue;

      // Must contain a channel receive but no exit path.
      if (!containsType(forBody, RECEIVE_TYPES)) continue;
      if (containsType(forBody, EXIT_TYPES)) continue;

      if (reported.has(go.startPosition.row)) continue;
      reported.add(go.startPosition.row);
      if (ctx.isSuppressed(go.startPosition.row, 'IED-C008')) continue;

      ctx.report({
        message: 'Goroutine loops on a channel with no exit path; it may leak.',
        severity: Severity.Warning,
        range: nodeRange(go)
      });
    }
  }
};
