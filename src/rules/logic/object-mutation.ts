import * as ts from 'typescript';
import { Rule } from '../../rules-engine/types';
import { locOf, visit } from '../../rules-engine/engine';

/**
 * Detects mutation of variables annotated with `Readonly<...>`,
 * `ReadonlyArray<T>` or declared `const x: readonly ...`.
 * Best-effort syntactic check (no type checker).
 */
export const objectMutationRule: Rule = {
  meta: {
    id: 'logic/object-mutation',
    name: 'Object mutation when immutable expected',
    description: 'Mutation of values annotated as Readonly/ReadonlyArray.',
    category: 'logic',
    defaultSeverity: 'warning'
  },
  run(ctx) {
    const sf = ctx.ast as ts.SourceFile;
    const readonlyVars = new Set<string>();

    visit(sf, n => {
      if (ts.isVariableDeclaration(n) && n.type) {
        const t = n.type.getText(sf);
        if (/\bReadonly\b|\breadonly\b|ReadonlyArray/.test(t) && ts.isIdentifier(n.name)) {
          readonlyVars.add(n.name.text);
        }
      }
      if (ts.isParameter(n) && n.type) {
        const t = n.type.getText(sf);
        if (/\bReadonly\b|\breadonly\b|ReadonlyArray/.test(t) && ts.isIdentifier(n.name)) {
          readonlyVars.add(n.name.text);
        }
      }
    });

    visit(sf, n => {
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const root = rootIdentifier(n.left);
        if (root && readonlyVars.has(root)) {
          ctx.report({
            message: `Mutation of read-only value "${root}".`,
            severity: 'warning',
            location: locOf(n, sf)
          });
        }
      }
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
        const obj = rootIdentifier(n.expression.expression);
        const method = n.expression.name.text;
        if (obj && readonlyVars.has(obj) && /^(push|pop|shift|unshift|splice|sort|reverse)$/.test(method)) {
          ctx.report({
            message: `Mutating method ".${method}()" called on read-only "${obj}".`,
            severity: 'warning',
            location: locOf(n, sf)
          });
        }
      }
    });
  }
};

function rootIdentifier(expr: ts.Expression): string | null {
  let cur: ts.Node = expr;
  while (ts.isPropertyAccessExpression(cur) || ts.isElementAccessExpression(cur)) cur = cur.expression;
  return ts.isIdentifier(cur) ? cur.text : null;
}
