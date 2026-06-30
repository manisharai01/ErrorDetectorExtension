/**
 * IED-L015 — null-deref-chain (Java)
 *
 * A long chain of member/method accesses such as `a.getB().getC().getD()` or
 * `x.y.z.w` dereferences several intermediate results in a row. Any link that
 * returns `null` throws a NullPointerException, and the chain offers no place
 * to guard against it. This rule flags chains of three or more links used as an
 * expression value.
 *
 * Conservative by design: we only count the longest *outer* chain reached
 * through the `object:` field, we de-duplicate by reporting once per top-level
 * chain (not once per link), and we skip chains that are themselves the object
 * of a longer enclosing chain. We do not attempt to prove an intermediate is
 * non-null — the point is to surface chains worth a second look.
 *
 * Walk-based: chain depth is a count over nested `object:` edges, which
 * Tree-sitter queries cannot express.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

/** Nodes that form a dereference link via their `object:` field. */
const CHAIN_NODES = new Set(['method_invocation', 'field_access']);

/**
 * Count the number of chained links reachable through `object:` edges starting
 * at `node`. A bare `a.b` is 2 links; `a.b.c` is 3; `a.getB().getC()` is 3.
 */
function chainLength(node: TSNode): number {
  let count = 0;
  let cur: TSNode | null = node;
  while (cur && CHAIN_NODES.has(cur.type)) {
    count++;
    cur = cur.childForFieldName('object');
  }
  return count;
}

const MIN_LINKS = 3;

export const nullDerefChainRule: Rule = {
  id: 'IED-L015',
  name: 'null-deref-chain',
  category: 'logic',
  severity: Severity.Warning,
  languages: ['java'],
  description: 'A long chained dereference may throw NullPointerException.',
  docs: [
    '# null-deref-chain (IED-L015)',
    '',
    'A chain of three or more member/method accesses dereferences several',
    'intermediate values in a row. If any link returns `null`, the chain throws',
    'a NullPointerException with no opportunity to guard.',
    '',
    '```java',
    'String s = order.getCustomer().getAddress().getCity(); // flagged',
    '```',
    '',
    'Break the chain and null-check the intermediate results, or use',
    '`Optional` / a null-safe accessor.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (CHAIN_NODES.has(node.type)) {
        // Only report at the *top* of a chain: if our parent is itself a chain
        // link that reaches us through its `object:` field, defer to it.
        const parent = node.parent;
        const isInnerLink =
          parent != null &&
          CHAIN_NODES.has(parent.type) &&
          parent.childForFieldName('object')?.id === node.id;

        if (!isInnerLink && chainLength(node) >= MIN_LINKS) {
          if (!ctx.isSuppressed(node.startPosition.row, 'IED-L015')) {
            ctx.report({
              message:
                'Long dereference chain may NPE; check intermediate nulls.',
              severity: Severity.Warning,
              range: nodeRange(node),
              data: { links: chainLength(node) }
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
