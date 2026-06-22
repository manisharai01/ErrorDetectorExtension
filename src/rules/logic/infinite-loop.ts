import * as ts from 'typescript';
import { Rule } from '../../rules-engine/types';
import { locOf, visit } from '../../rules-engine/engine';

/** `while (true)` / `for (;;)` without a `break`, `return`, `throw` or `continue`-to-outer. */
export const infiniteLoopRule: Rule = {
  meta: {
    id: 'logic/infinite-loop',
    name: 'Infinite loop without exit',
    description: 'A constant-true loop that has no break/return/throw inside.',
    category: 'logic',
    defaultSeverity: 'error'
  },
  run(ctx) {
    const sf = ctx.ast as ts.SourceFile;
    visit(sf, n => {
      const body = isAlwaysTrueLoop(n);
      if (!body) return;
      if (!hasExit(body)) {
        ctx.report({
          message: 'Loop appears to run forever (no break/return/throw inside).',
          severity: 'error',
          location: locOf(n, sf)
        });
      }
    });
  }
};

function isAlwaysTrueLoop(n: ts.Node): ts.Statement | null {
  if (ts.isWhileStatement(n) && isTruthyLiteral(n.expression)) return n.statement;
  if (ts.isDoStatement(n) && isTruthyLiteral(n.expression)) return n.statement;
  if (ts.isForStatement(n) && !n.condition) return n.statement;
  return null;
}
function isTruthyLiteral(e: ts.Expression): boolean {
  return e.kind === ts.SyntaxKind.TrueKeyword
    || (ts.isNumericLiteral(e) && e.text !== '0')
    || (ts.isStringLiteral(e) && e.text.length > 0);
}
function hasExit(stmt: ts.Statement): boolean {
  let found = false;
  const walk = (n: ts.Node) => {
    if (found) return;
    if (ts.isBreakStatement(n) || ts.isReturnStatement(n) || ts.isThrowStatement(n)) { found = true; return; }
    if (ts.isFunctionLike(n)) return; // don't descend into nested functions
    ts.forEachChild(n, walk);
  };
  walk(stmt);
  return found;
}
