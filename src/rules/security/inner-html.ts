import * as ts from 'typescript';
import { Rule } from '../../rules-engine/types';
import { locOf, visit } from '../../rules-engine/engine';

const SINKS = new Set(['innerHTML', 'outerHTML', 'insertAdjacentHTML']);

/** Assignments to innerHTML/outerHTML or insertAdjacentHTML calls without DOMPurify. */
export const innerHtmlRule: Rule = {
  meta: {
    id: 'security/inner-html',
    name: 'Unsafe innerHTML/outerHTML assignment',
    description: 'Assigning to innerHTML/outerHTML allows XSS unless input is sanitised.',
    category: 'security',
    defaultSeverity: 'error'
  },
  run(ctx) {
    const sf = ctx.ast as ts.SourceFile;
    const sanitisedInScope = /\bDOMPurify\b|\bsanitize(?:Html)?\b/i.test(ctx.sourceText);
    visit(sf, n => {
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
          && ts.isPropertyAccessExpression(n.left) && SINKS.has(n.left.name.text)) {
        if (sanitisedInScope) return;
        ctx.report({
          message: `Assignment to ${n.left.name.text} without visible sanitiser (DOMPurify).`,
          severity: 'error',
          location: locOf(n, sf)
        });
      }
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
          && n.expression.name.text === 'insertAdjacentHTML') {
        if (sanitisedInScope) return;
        ctx.report({
          message: 'insertAdjacentHTML used without visible sanitiser.',
          severity: 'error',
          location: locOf(n, sf)
        });
      }
    });
  }
};
