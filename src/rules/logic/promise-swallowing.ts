import * as ts from 'typescript';
import { Rule } from '../../rules-engine/types';
import { locOf, visit } from '../../rules-engine/engine';

const PROMISE_METHODS = new Set(['fetch']);

/** Promise-returning calls that aren't awaited, returned, or `.then`/`.catch`'d. */
export const promiseSwallowingRule: Rule = {
  meta: {
    id: 'logic/promise-swallowing',
    name: 'Promise swallowed (no await/then/catch)',
    description: 'Async/promise-returning calls used as statements without handling.',
    category: 'logic',
    defaultSeverity: 'warning'
  },
  run(ctx) {
    const sf = ctx.ast as ts.SourceFile;
    const asyncFns = new Set<string>();

    visit(sf, n => {
      if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) && n.name && ts.isIdentifier(n.name)) {
        asyncFns.add(n.name.text);
      }
      if (ts.isVariableDeclaration(n) && n.initializer && ts.isIdentifier(n.name)) {
        const init = n.initializer;
        if ((ts.isArrowFunction(init) || ts.isFunctionExpression(init)) &&
            init.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) {
          asyncFns.add(n.name.text);
        }
      }
    });

    visit(sf, n => {
      if (!ts.isExpressionStatement(n)) return;
      const expr = n.expression;
      if (ts.isAwaitExpression(expr)) return;
      if (!ts.isCallExpression(expr)) return;

      let callee: string | null = null;
      if (ts.isIdentifier(expr.expression)) callee = expr.expression.text;
      else if (ts.isPropertyAccessExpression(expr.expression)) callee = expr.expression.name.text;

      const looksAsync =
        (callee && asyncFns.has(callee)) ||
        (callee && PROMISE_METHODS.has(callee)) ||
        endsWithPromiseHandler(expr) === false && hasThenChain(expr) === false && callee?.endsWith('Async') === true;

      if (looksAsync) {
        ctx.report({
          message: `Promise from "${callee}" is neither awaited nor handled with .then/.catch.`,
          severity: 'warning',
          location: locOf(expr, sf),
          suggestion: 'Await the call, return it, or attach a .catch() handler.'
        });
      }
    });
  }
};

function hasThenChain(call: ts.CallExpression): boolean {
  // call is `x.y()` — check parent chain for `.then(...)` / `.catch(...)`.
  let parent: ts.Node | undefined = call.parent;
  while (parent) {
    if (ts.isPropertyAccessExpression(parent) && /^(then|catch|finally)$/.test(parent.name.text)) return true;
    parent = parent.parent;
  }
  return false;
}

function endsWithPromiseHandler(call: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(call.expression)) return false;
  return /^(then|catch|finally)$/.test(call.expression.name.text);
}
