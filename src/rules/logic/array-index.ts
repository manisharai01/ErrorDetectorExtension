import * as ts from 'typescript';
import { Rule } from '../../rules-engine/types';
import { locOf, visit } from '../../rules-engine/engine';

/**
 * Heuristic detection of off-by-one indexing patterns:
 *   for (let i = 0; i <= arr.length; i++) { ... arr[i] ... }
 *   arr[arr.length]
 */
export const arrayIndexErrorRule: Rule = {
  meta: {
    id: 'logic/array-index',
    name: 'Array index off-by-one',
    description: 'Detects suspicious indexing such as <= arr.length and arr[arr.length].',
    category: 'logic',
    defaultSeverity: 'warning'
  },
  run(ctx) {
    const sf = ctx.ast as ts.SourceFile;
    visit(sf, node => {
      if (ts.isForStatement(node) && node.condition && ts.isBinaryExpression(node.condition)) {
        const op = node.condition.operatorToken.kind;
        const right = node.condition.right;
        if (
          (op === ts.SyntaxKind.LessThanEqualsToken || op === ts.SyntaxKind.GreaterThanEqualsToken) &&
          ts.isPropertyAccessExpression(right) &&
          ts.isIdentifier(right.name) && right.name.text === 'length'
        ) {
          ctx.report({
            message: 'Loop bound uses `<= .length` which iterates one past the end (off-by-one).',
            severity: 'warning',
            location: locOf(node.condition, sf),
            suggestion: 'Use `<` instead of `<=` when iterating to length.'
          });
        }
      }
      if (ts.isElementAccessExpression(node) && ts.isPropertyAccessExpression(node.argumentExpression)) {
        const arg = node.argumentExpression;
        if (ts.isIdentifier(arg.name) && arg.name.text === 'length') {
          ctx.report({
            message: 'Indexing with `arr[arr.length]` always returns undefined.',
            severity: 'warning',
            location: locOf(node, sf)
          });
        }
      }
    });
  }
};
