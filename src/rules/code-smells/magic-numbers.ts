import * as ts from 'typescript';
import { Rule } from '../../rules-engine/types';
import { locOf, visit } from '../../rules-engine/engine';

const ALLOWED = new Set(['0', '1', '-1', '2', '100', '1000']);

/** Numeric literals other than the common ones, used outside `const` initialisers. */
export const magicNumbersRule: Rule = {
  meta: {
    id: 'smell/magic-numbers',
    name: 'Magic number',
    description: 'Numeric literals other than 0, 1, -1 used in expressions.',
    category: 'code-smell',
    defaultSeverity: 'info'
  },
  run(ctx) {
    const sf = ctx.ast as ts.SourceFile;
    visit(sf, n => {
      if (!ts.isNumericLiteral(n)) return;
      const text = n.getText(sf);
      if (ALLOWED.has(text)) return;
      // skip if direct child of a VariableDeclaration with `const`
      const parent = n.parent;
      if (parent && ts.isVariableDeclaration(parent)) {
        const list = parent.parent;
        if (ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Const)) return;
      }
      // skip in array/object literal positions if shape uses index 0/1 only
      if (parent && ts.isPropertyAssignment(parent)) return;
      ctx.report({
        message: `Magic number ${text} — extract to a named constant.`,
        severity: 'info',
        location: locOf(n, sf)
      });
    });
  }
};
