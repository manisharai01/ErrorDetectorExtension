import * as ts from 'typescript';
import { Rule } from '../../rules-engine/types';
import { locOf } from '../../rules-engine/engine';

const MAX_DEPTH = 4;

/** Statements nested deeper than 4 control-flow levels. */
export const deepNestingRule: Rule = {
  meta: {
    id: 'smell/deep-nesting',
    name: 'Deep nesting',
    description: 'Control-flow nesting deeper than 4 levels indicates a refactor opportunity.',
    category: 'code-smell',
    defaultSeverity: 'info'
  },
  run(ctx) {
    const sf = ctx.ast as ts.SourceFile;
    const walk = (n: ts.Node, depth: number) => {
      const isNesting =
        ts.isIfStatement(n) || ts.isForStatement(n) || ts.isForInStatement(n) || ts.isForOfStatement(n)
        || ts.isWhileStatement(n) || ts.isDoStatement(n) || ts.isSwitchStatement(n) || ts.isTryStatement(n);
      const next = isNesting ? depth + 1 : depth;
      if (isNesting && next > MAX_DEPTH) {
        ctx.report({
          message: `Nesting depth ${next} exceeds maximum of ${MAX_DEPTH}.`,
          severity: 'info',
          location: locOf(n, sf)
        });
      }
      ts.forEachChild(n, c => walk(c, next));
    };
    walk(sf, 0);
  }
};
