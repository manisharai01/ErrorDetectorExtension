import * as ts from 'typescript';
import { Rule } from '../../rules-engine/types';
import { locOf, visit } from '../../rules-engine/engine';

/** Function/method parameters that are never referenced in the body. */
export const unusedParametersRule: Rule = {
  meta: {
    id: 'smell/unused-parameters',
    name: 'Unused function parameter',
    description: 'Parameter is declared but never used inside the body.',
    category: 'code-smell',
    defaultSeverity: 'info',
    fixable: true
  },
  run(ctx) {
    const sf = ctx.ast as ts.SourceFile;
    visit(sf, n => {
      if (!ts.isFunctionLike(n) || !(n as ts.FunctionLikeDeclaration).body) return;
      const fn = n as ts.FunctionLikeDeclaration;
      const used = new Set<string>();
      visit(fn.body!, x => {
        if (ts.isIdentifier(x) && x.parent !== fn) used.add(x.text);
      });
      for (const p of fn.parameters) {
        if (!ts.isIdentifier(p.name)) continue;
        const name = p.name.text;
        if (name.startsWith('_')) continue;
        if (!used.has(name)) {
          ctx.report({
            message: `Parameter "${name}" is unused. Prefix with "_" to silence.`,
            severity: 'info',
            location: locOf(p, sf),
            fixable: true,
            data: { paramName: name }
          });
        }
      }
    });
  }
};
