/**
 * IED-P007 — n-plus-one-query
 *
 * Flags ORM-style query calls inside the body of a `for` loop — the classic
 * N+1 pattern, where one query per iteration replaces a single batched query.
 *
 * Heuristic: a `call` whose callee is an attribute chain ending in a query verb
 * (`filter`, `get`, `all`, `first`, `count`) or whose chain contains `objects`
 * (`Model.objects...`), reached while inside a `for_statement` body.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const QUERY_METHODS = new Set(['filter', 'get', 'all', 'first', 'count', 'select_related']);

/** Last attribute name of a call's callee, plus whether the chain mentions `objects`. */
function describeCallee(call: TSNode): { method: string | null; hasObjects: boolean } {
  const fn = call.childForFieldName('function');
  if (!fn || fn.type !== 'attribute') return { method: null, hasObjects: false };
  const method = fn.childForFieldName('attribute')?.text ?? null;
  let hasObjects = false;
  let cur: TSNode | null = fn;
  while (cur && cur.type === 'attribute') {
    if (cur.childForFieldName('attribute')?.text === 'objects') hasObjects = true;
    cur = cur.childForFieldName('object');
  }
  return { method, hasObjects };
}

export const nPlusOneQueryRule: Rule = {
  id: 'IED-P007',
  name: 'n-plus-one-query',
  category: 'performance',
  severity: Severity.Warning,
  languages: ['python'],
  description: 'A database/ORM query executed inside a loop (possible N+1).',
  docs: [
    '# n-plus-one-query (IED-P007)',
    '',
    'Running a query inside a loop issues one round-trip per iteration. Batch the',
    'data with a single query (e.g. `select_related`/`prefetch_related`, or an',
    '`IN (...)` query) instead.',
    '',
    '```py',
    'for order in orders:',
    '    items = Item.objects.filter(order_id=order.id)  # flagged',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walkInLoop = (node: TSNode): void => {
      if (node.type === 'call') {
        const { method, hasObjects } = describeCallee(node);
        if (method && (hasObjects || QUERY_METHODS.has(method))) {
          if (!ctx.isSuppressed(node.startPosition.row, 'IED-P007')) {
            ctx.report({
              message: `Query \`.${method}(...)\` runs inside a loop (possible N+1). Batch it into a single query.`,
              severity: Severity.Warning,
              range: nodeRange(node),
              data: { method }
            });
          }
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const c = node.child(i);
        if (c) walkInLoop(c);
      }
    };

    const walk = (node: TSNode): void => {
      if (node.type === 'for_statement') {
        // Handle the whole subtree of the outermost loop here; nested loops are
        // already covered by walkInLoop, so don't recurse past this point.
        const body = node.childForFieldName('body');
        if (body) walkInLoop(body);
        return;
      }
      for (let i = 0; i < node.childCount; i++) {
        const c = node.child(i);
        if (c) walk(c);
      }
    };
    walk(ctx.tree.rootNode);
  }
};
