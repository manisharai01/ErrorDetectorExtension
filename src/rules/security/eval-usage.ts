import * as ts from 'typescript';
import { Rule } from '../../rules-engine/types';
import { locOf, visit } from '../../rules-engine/engine';

/** Direct use of `eval` or `new Function(...)`. */
export const evalUsageRule: Rule = {
  meta: {
    id: 'security/eval-usage',
    name: 'eval() / new Function() usage',
    description: 'Dynamic code execution opens injection and CSP risks.',
    category: 'security',
    defaultSeverity: 'error'
  },
  run(ctx) {
    const sf = ctx.ast as ts.SourceFile;
    visit(sf, n => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'eval') {
        ctx.report({ message: 'Avoid eval() — it executes arbitrary code.', severity: 'error', location: locOf(n, sf) });
      }
      if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'Function') {
        ctx.report({ message: 'Avoid `new Function(...)` — equivalent to eval().', severity: 'error', location: locOf(n, sf) });
      }
    });
  }
};
