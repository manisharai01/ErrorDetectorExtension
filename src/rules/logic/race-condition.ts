import * as ts from 'typescript';
import { Rule } from '../../rules-engine/types';
import { locOf, visit } from '../../rules-engine/engine';

/**
 * Detects shared mutable state written in two awaited branches without
 * synchronisation — a classic race-condition smell. Heuristic: an async
 * function with two or more `await` expressions whose right-hand sides
 * write to the same identifier.
 */
export const raceConditionRule: Rule = {
  meta: {
    id: 'logic/race-condition',
    name: 'Possible race condition in async code',
    description: 'Multiple awaited writes to the same variable without coordination.',
    category: 'logic',
    defaultSeverity: 'info'
  },
  run(ctx) {
    const sf = ctx.ast as ts.SourceFile;
    visit(sf, node => {
      if (!isAsyncFn(node)) return;
      const writes = new Map<string, ts.Node[]>();
      visit(node, inner => {
        if (ts.isAwaitExpression(inner) && inner.parent && ts.isBinaryExpression(inner.parent)
            && inner.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
          const lhs = inner.parent.left;
          if (ts.isIdentifier(lhs) || ts.isPropertyAccessExpression(lhs)) {
            const name = lhs.getText(sf);
            (writes.get(name) ?? writes.set(name, []).get(name)!).push(inner.parent);
          }
        }
      });
      for (const [name, list] of writes) {
        if (list.length >= 2) {
          ctx.report({
            message: `Variable "${name}" is assigned in multiple awaited expressions; possible race condition.`,
            severity: 'info',
            location: locOf(list[0], sf)
          });
        }
      }
    });
  }
};

function isAsyncFn(n: ts.Node): boolean {
  return (ts.isFunctionLike(n) as boolean) &&
    !!(n as ts.FunctionLikeDeclaration).modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword);
}
