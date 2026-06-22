import * as ts from 'typescript';
import { Rule } from '../../rules-engine/types';
import { locOf, visit } from '../../rules-engine/engine';

/** Recursive function with no obvious base case (no `if/return` before recursive call). */
export const recursionBaseCaseRule: Rule = {
  meta: {
    id: 'logic/recursion-base-case',
    name: 'Recursion without a base case',
    description: 'Function calls itself without a guarded return path.',
    category: 'logic',
    defaultSeverity: 'warning'
  },
  run(ctx) {
    const sf = ctx.ast as ts.SourceFile;
    visit(sf, node => {
      if (!ts.isFunctionDeclaration(node) || !node.name || !node.body) return;
      const name = node.name.text;
      let recursive = false;
      let hasGuard = false;
      visit(node.body, n => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name) recursive = true;
        if (ts.isIfStatement(n)) {
          // Treat any return/throw inside an if as a base case.
          let returns = false;
          visit(n.thenStatement, m => { if (ts.isReturnStatement(m) || ts.isThrowStatement(m)) returns = true; });
          if (returns) hasGuard = true;
        }
      });
      if (recursive && !hasGuard) {
        ctx.report({
          message: `Function "${name}" recurses but has no guarded base case (if + return).`,
          severity: 'warning',
          location: locOf(node.name, sf)
        });
      }
    });
  }
};
