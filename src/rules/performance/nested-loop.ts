import * as ts from 'typescript';
import { Rule } from '../../rules-engine/types';
import { locOf, visit } from '../../rules-engine/engine';

/** Detects O(n^2) work: nested array iteration over the same identifier. */
export const nestedLoopHotspotRule: Rule = {
  meta: {
    id: 'perf/nested-loop',
    name: 'Nested loop over same collection',
    description: 'Two `for`/`forEach` loops nested over the same array (O(n^2)).',
    category: 'performance',
    defaultSeverity: 'info'
  },
  run(ctx) {
    const sf = ctx.ast as ts.SourceFile;
    const stack: string[] = [];
    const walk = (n: ts.Node) => {
      let pushed: string | null = null;
      const target = loopTarget(n);
      if (target) {
        if (stack.includes(target)) {
          ctx.report({
            message: `Nested iteration over "${target}" — consider Map/Set for lookups.`,
            severity: 'info',
            location: locOf(n, sf)
          });
        }
        stack.push(target);
        pushed = target;
      }
      ts.forEachChild(n, walk);
      if (pushed) stack.pop();
    };
    walk(sf);
  }
};

function loopTarget(n: ts.Node): string | null {
  if (ts.isForOfStatement(n) || ts.isForInStatement(n)) {
    return ts.isIdentifier(n.expression) ? n.expression.text : null;
  }
  if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
    if (/^(forEach|map|filter|reduce|some|every|find)$/.test(n.expression.name.text)
        && ts.isIdentifier(n.expression.expression)) {
      return n.expression.expression.text;
    }
  }
  return null;
}
