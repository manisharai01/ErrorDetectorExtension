/**
 * IED-L007 — type-guard-contradiction
 *
 * Detects a logical-AND of `typeof` checks that can never all be true at once,
 * e.g. `typeof x === 'string' && typeof x === 'number'`. Ported from the legacy
 * `logic/type-guard-contradiction` rule.
 *
 * In Tree-sitter, `typeof x` is a `unary_expression` with operator `typeof`,
 * and a string literal's text is in its `string_fragment` child. Cross-capture
 * equality (same identifier on both sides) is decided by comparing node text.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

/** A single `typeof x === "..."` comparison. */
interface TypeofCheck {
  variable: string;
  literal: string;
}

/** Text of the first `string_fragment` descendant of a `string` node. */
function stringLiteralText(node: TSNode): string | null {
  if (node.type !== 'string') return null;
  const frag = node.descendantsOfType('string_fragment')[0];
  return frag ? frag.text : '';
}

/**
 * If `eq` is a `===`/`==` comparison of `typeof <identifier>` against a string
 * literal (in either order), return the {variable, literal} pair.
 */
function typeofCheckFrom(eq: TSNode): TypeofCheck | null {
  if (eq.type !== 'binary_expression') return null;
  const op = eq.childForFieldName('operator');
  if (!op || (op.text !== '===' && op.text !== '==')) return null;
  const left = eq.childForFieldName('left');
  const right = eq.childForFieldName('right');
  if (!left || !right) return null;

  const pick = (a: TSNode, b: TSNode): TypeofCheck | null => {
    if (a.type !== 'unary_expression') return null;
    const unaryOp = a.childForFieldName('operator');
    if (!unaryOp || unaryOp.text !== 'typeof') return null;
    const arg = a.childForFieldName('argument');
    if (!arg || arg.type !== 'identifier') return null;
    const lit = stringLiteralText(b);
    if (lit === null) return null;
    return { variable: arg.text, literal: lit };
  };

  return pick(left, right) ?? pick(right, left);
}

/** Flatten a `&&` chain and collect every typeof comparison within it. */
function collectTypeofChecks(node: TSNode, out: TypeofCheck[]): void {
  if (node.type !== 'binary_expression') return;
  const op = node.childForFieldName('operator');
  const left = node.childForFieldName('left');
  const right = node.childForFieldName('right');
  if (op && op.text === '&&') {
    if (left) collectTypeofChecks(left, out);
    if (right) collectTypeofChecks(right, out);
    return;
  }
  const check = typeofCheckFrom(node);
  if (check) out.push(check);
}

export const typeGuardContradictionRule: Rule = {
  id: 'IED-L007',
  name: 'type-guard-contradiction',
  category: 'logic',
  severity: Severity.Warning,
  languages: ['typescript', 'tsx', 'javascript'],
  description: 'A logical-AND of typeof checks that can never all be true.',
  docs: [
    '# type-guard-contradiction (IED-L007)',
    '',
    'Joining mutually exclusive `typeof` checks with `&&` is always false:',
    '',
    '```ts',
    "if (typeof x === 'string' && typeof x === 'number') { /* unreachable */ }",
    '```',
    '',
    'Did you mean `||`, or are you checking the wrong variable?'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (node.type === 'binary_expression') {
        const op = node.childForFieldName('operator');
        // Only consider the top of an && chain (parent is not itself an && bin-expr).
        const parent = node.parent;
        const parentIsAnd =
          parent &&
          parent.type === 'binary_expression' &&
          parent.childForFieldName('operator')?.text === '&&';
        if (op && op.text === '&&' && !parentIsAnd) {
          const checks: TypeofCheck[] = [];
          collectTypeofChecks(node, checks);
          // Group literals by variable; >1 distinct literal for one variable = contradiction.
          const byVar = new Map<string, Set<string>>();
          for (const c of checks) {
            const set = byVar.get(c.variable) ?? new Set<string>();
            set.add(c.literal);
            byVar.set(c.variable, set);
          }
          for (const [v, lits] of byVar) {
            if (lits.size > 1) {
              if (!ctx.isSuppressed(node.startPosition.row, 'IED-L007')) {
                ctx.report({
                  message: `"${v}" is checked against multiple typeof values (${[...lits].join(', ')}) joined by &&; this is always false.`,
                  severity: Severity.Warning,
                  range: nodeRange(node),
                  data: { variable: v, literals: [...lits] }
                });
              }
              break;
            }
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
