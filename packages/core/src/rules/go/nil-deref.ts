/**
 * IED-L014 — nil-deref (Go)
 *
 * A nil check that comes *after* the variable has already been dereferenced is
 * a logic smell: the dereference would have panicked before the check ran.
 *
 * Conservative heuristic, scoped to a single block:
 *   - find a `selector_expression` (or index) whose operand is an identifier `x`,
 *   - then look for a later sibling `if_statement` whose condition is
 *     `x != nil` for the same `x`.
 * If the nil-check appears at a later statement index than the first use, flag.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

/** Root identifier of a selector chain like `x.y.z` -> "x". */
function rootIdentifier(node: TSNode): string | null {
  let cur: TSNode | null = node;
  while (cur) {
    if (cur.type === 'identifier') return cur.text;
    if (cur.type === 'selector_expression' || cur.type === 'index_expression') {
      cur = cur.childForFieldName('operand');
      continue;
    }
    return null;
  }
  return null;
}

/** If `cond` is `x != nil`, return "x"; else null. */
function nilCheckTarget(cond: TSNode | null): string | null {
  if (!cond || cond.type !== 'binary_expression') return null;
  const op = cond.childForFieldName('operator');
  if (!op || op.text !== '!=') return null;
  const left = cond.childForFieldName('left');
  const right = cond.childForFieldName('right');
  if (!left || !right) return null;
  if (right.type === 'nil' && left.type === 'identifier') return left.text;
  if (left.type === 'nil' && right.type === 'identifier') return right.text;
  return null;
}

/** Collect identifiers dereferenced via selector/index within a statement. */
function derefedVars(stmt: TSNode, out: Map<string, TSNode>): void {
  const visit = (node: TSNode): void => {
    if (node.type === 'selector_expression' || node.type === 'index_expression') {
      const operand = node.childForFieldName('operand');
      if (operand && operand.type === 'identifier') {
        if (!out.has(operand.text)) out.set(operand.text, node);
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) visit(child);
    }
  };
  visit(stmt);
}

export const nilDerefRule: Rule = {
  id: 'IED-L014',
  name: 'nil-deref',
  category: 'logic',
  severity: Severity.Warning,
  languages: ['go'],
  description: 'A variable is dereferenced before its nil check.',
  docs: [
    '# nil-deref (IED-L014)',
    '',
    'Checking for nil *after* dereferencing is too late — the dereference would',
    'already have panicked:',
    '',
    '```go',
    'name := u.Name   // dereference',
    'if u != nil { }  // flagged: check comes after use',
    '```',
    '',
    'Move the `if x != nil` guard before the first use of `x`.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walkBlock = (block: TSNode): void => {
      const stmts: TSNode[] = [];
      for (let i = 0; i < block.namedChildCount; i++) {
        const s = block.namedChild(i);
        if (s) stmts.push(s);
      }

      // Record the first statement index at which each var is dereferenced.
      const firstUse = new Map<string, number>();
      const useNode = new Map<string, TSNode>();
      for (let i = 0; i < stmts.length; i++) {
        const m = new Map<string, TSNode>();
        derefedVars(stmts[i], m);
        for (const [name, node] of m) {
          if (!firstUse.has(name)) {
            firstUse.set(name, i);
            useNode.set(name, node);
          }
        }
      }

      // Look for a later `if x != nil` for a var already used.
      for (let i = 0; i < stmts.length; i++) {
        const stmt = stmts[i];
        if (stmt.type !== 'if_statement') continue;
        const target = nilCheckTarget(stmt.childForFieldName('condition'));
        if (!target) continue;
        const used = firstUse.get(target);
        if (used === undefined || used >= i) continue;

        const node = useNode.get(target);
        if (!node) continue;
        if (ctx.isSuppressed(node.startPosition.row, 'IED-L014')) continue;
        ctx.report({
          message: `'${target}' is dereferenced before its nil check.`,
          severity: Severity.Warning,
          range: nodeRange(node),
          data: { variable: target }
        });
      }
    };

    const walk = (node: TSNode): void => {
      if (node.type === 'block') walkBlock(node);
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child);
      }
    };

    walk(ctx.tree.rootNode);
  }
};
