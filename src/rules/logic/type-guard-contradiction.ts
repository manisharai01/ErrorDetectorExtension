import * as ts from 'typescript';
import { Rule } from '../../rules-engine/types';
import { locOf, visit } from '../../rules-engine/engine';

/** Detects `typeof x === 'string' && typeof x === 'number'` and similar contradictions. */
export const typeGuardContradictionRule: Rule = {
  meta: {
    id: 'logic/type-guard-contradiction',
    name: 'Contradictory type guard',
    description: 'A logical-AND of typeof checks that can never both be true.',
    category: 'logic',
    defaultSeverity: 'error'
  },
  run(ctx) {
    const sf = ctx.ast as ts.SourceFile;
    visit(sf, node => {
      if (!ts.isBinaryExpression(node)) return;
      if (node.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) return;
      const checks = collectTypeofChecks(node);
      const byVar = new Map<string, Set<string>>();
      for (const c of checks) {
        const set = byVar.get(c.variable) ?? new Set<string>();
        set.add(c.literal);
        byVar.set(c.variable, set);
      }
      for (const [v, lits] of byVar) {
        if (lits.size > 1) {
          ctx.report({
            message: `"${v}" is checked against multiple typeof values (${[...lits].join(', ')}) joined by &&; this is always false.`,
            severity: 'error',
            location: locOf(node, sf)
          });
          break;
        }
      }
    });
  }
};

function collectTypeofChecks(expr: ts.Expression): { variable: string; literal: string }[] {
  const out: { variable: string; literal: string }[] = [];
  const walk = (e: ts.Expression) => {
    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      walk(e.left); walk(e.right); return;
    }
    if (ts.isBinaryExpression(e) &&
        (e.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken || e.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken)) {
      const t = pickTypeof(e.left, e.right) ?? pickTypeof(e.right, e.left);
      if (t) out.push(t);
    }
  };
  walk(expr);
  return out;
}

function pickTypeof(a: ts.Expression, b: ts.Expression): { variable: string; literal: string } | null {
  if (ts.isTypeOfExpression(a) && ts.isStringLiteralLike(b) && ts.isIdentifier(a.expression)) {
    return { variable: a.expression.text, literal: b.text };
  }
  return null;
}
