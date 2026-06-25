/**
 * IED-P008 — append-prealloc (Go)
 *
 * Repeatedly `x = append(x, ...)` inside a loop grows the backing array via
 * successive reallocations. When the final size is known (e.g. `len(src)`),
 * preallocating with `make([]T, 0, len(src))` avoids the churn.
 *
 * Conservative shape we flag: an `assignment_statement` (or short_var_decl)
 * inside a `for_statement` body whose right side is `append(x, ...)` with the
 * same slice `x` as the assignment target (append-to-self in a loop).
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

/** True if `node` has a `for_statement` ancestor before any function boundary. */
function insideLoop(node: TSNode): boolean {
  let cur: TSNode | null = node.parent;
  while (cur) {
    if (cur.type === 'for_statement') return true;
    if (FUNCTION_BOUNDARY.has(cur.type)) return false;
    cur = cur.parent;
  }
  return false;
}

/** Single identifier text of an expression_list with exactly one identifier. */
function soleIdentifier(exprList: TSNode | null): string | null {
  if (!exprList) return null;
  if (exprList.namedChildCount !== 1) return null;
  const c = exprList.namedChild(0);
  return c && c.type === 'identifier' ? c.text : null;
}

/** If `expr` is `append(x, ...)`, return "x"; else null. */
function appendTarget(expr: TSNode | null): string | null {
  if (!expr || expr.type !== 'call_expression') return null;
  const fn = expr.childForFieldName('function');
  if (!fn || fn.type !== 'identifier' || fn.text !== 'append') return null;
  const args = expr.childForFieldName('arguments');
  const first = args?.namedChild(0);
  return first && first.type === 'identifier' ? first.text : null;
}

export const appendPreallocRule: Rule = {
  id: 'IED-P008',
  name: 'append-prealloc',
  category: 'performance',
  severity: Severity.Info,
  languages: ['go'],
  description: 'append-to-self inside a loop; preallocate the slice instead.',
  docs: [
    '# append-prealloc (IED-P008)',
    '',
    'Growing a slice with `append` each iteration reallocates repeatedly:',
    '',
    '```go',
    'var out []int',
    'for _, v := range src {',
    '    out = append(out, v) // flagged',
    '}',
    '```',
    '',
    'Preallocate when the size is known: `out := make([]int, 0, len(src))`.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const reported = new Set<string>();

    const check = (node: TSNode, leftList: TSNode | null, rightList: TSNode | null): void => {
      const target = soleIdentifier(leftList);
      if (!target) return;
      const right = rightList?.namedChild(0) ?? null;
      const appended = appendTarget(right);
      if (!appended || appended !== target) return;
      if (!insideLoop(node)) return;

      const key = `${node.startPosition.row}:${node.startPosition.column}`;
      if (reported.has(key)) return;
      reported.add(key);
      if (ctx.isSuppressed(node.startPosition.row, 'IED-P008')) return;
      ctx.report({
        message:
          `'${target} = append(${target}, ...)' inside a loop reallocates; ` +
          `preallocate with make([]T, 0, len(...)).`,
        severity: Severity.Info,
        range: nodeRange(node),
        data: { slice: target }
      });
    };

    const walk = (node: TSNode): void => {
      if (node.type === 'assignment_statement') {
        check(node, node.childForFieldName('left'), node.childForFieldName('right'));
      } else if (node.type === 'short_var_declaration') {
        check(node, node.childForFieldName('left'), node.childForFieldName('right'));
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child);
      }
    };

    walk(ctx.tree.rootNode);
  }
};
