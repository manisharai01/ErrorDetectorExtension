/**
 * IED-L008 — constant-condition
 *
 * Flags branch conditions that are literally `true`/`false`: `if (true)`,
 * `if (false)`, a ternary with a literal condition, and `while (false)` /
 * `do … while (false)`. `while (true)` is intentionally NOT flagged — it is the
 * idiomatic infinite loop (the infinite-loop rule IED-L005 covers the unsafe
 * cases). A constant condition means one branch is dead code.
 *
 * Ported as the single-file slice of the deferred data-flow "path-analysis"
 * work; no CFG required.
 */
import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

/** Unwrap `(…)` parens to get at the real condition expression. */
function unwrap(node: TSNode | null): TSNode | null {
  let cur = node;
  while (cur && cur.type === 'parenthesized_expression') {
    cur = cur.namedChild(0);
  }
  return cur;
}

function literalBool(node: TSNode | null): 'true' | 'false' | null {
  const inner = unwrap(node);
  if (inner && (inner.type === 'true' || inner.type === 'false')) {
    return inner.type;
  }
  return null;
}

export const constantConditionRule: Rule = {
  id: 'IED-L008',
  name: 'constant-condition',
  category: 'logic',
  severity: Severity.Warning,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue'],
  description: 'A branch condition is a constant literal, so one branch is dead code.',
  docs: [
    '# constant-condition (IED-L008)',
    '',
    'A condition that is literally `true` or `false` makes a branch unreachable.',
    '`if (true)` / `if (false)` and ternaries with a literal condition are almost',
    'always a leftover debugging edit. `while (true)` is allowed (intentional loop).'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const report = (node: TSNode, value: 'true' | 'false', kind: string): void => {
      if (ctx.isSuppressed(node.startPosition.row, 'IED-L008')) return;
      ctx.report({
        message: `${kind} condition is always ${value} — one branch is dead code.`,
        severity: Severity.Warning,
        range: nodeRange(node),
        data: { value }
      });
    };

    const walk = (node: TSNode): void => {
      if (node.type === 'if_statement') {
        const v = literalBool(node.childForFieldName('condition'));
        if (v) report(node.childForFieldName('condition') ?? node, v, 'if');
      } else if (node.type === 'ternary_expression') {
        const v = literalBool(node.childForFieldName('condition'));
        if (v) report(node.childForFieldName('condition') ?? node, v, 'Ternary');
      } else if (node.type === 'while_statement' || node.type === 'do_statement') {
        // Only `false` — `while (true)` is the idiomatic infinite loop.
        const v = literalBool(node.childForFieldName('condition'));
        if (v === 'false') report(node.childForFieldName('condition') ?? node, v, 'Loop');
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child);
      }
    };

    walk(ctx.tree.rootNode);
  }
};
