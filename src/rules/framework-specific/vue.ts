import * as ts from 'typescript';
import { Rule } from '../../rules-engine/types';
import { locOf, visit } from '../../rules-engine/engine';

/** Vue: direct assignment to a `ref().value`'s nested fields without `.value`. */
export const vueRefMutationRule: Rule = {
  meta: {
    id: 'vue/ref-misuse',
    name: 'Vue ref used without .value',
    description: 'Composition API ref accessed without .value in script context.',
    category: 'framework',
    defaultSeverity: 'info'
  },
  run(ctx) {
    if (ctx.language !== 'vue' && !ctx.projectContext.hasVue) return;
    const sf = ctx.ast as ts.SourceFile;
    const refs = new Set<string>();
    visit(sf, n => {
      if (ts.isVariableDeclaration(n) && n.initializer && ts.isCallExpression(n.initializer)
          && ts.isIdentifier(n.initializer.expression) && n.initializer.expression.text === 'ref'
          && ts.isIdentifier(n.name)) {
        refs.add(n.name.text);
      }
    });
    visit(sf, n => {
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
          && ts.isIdentifier(n.left) && refs.has(n.left.text)) {
        ctx.report({
          message: `Reassigning ref "${n.left.text}" replaces the ref. Did you mean ${n.left.text}.value = ...?`,
          severity: 'info',
          location: locOf(n, sf)
        });
      }
    });
  }
};
