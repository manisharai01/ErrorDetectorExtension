import * as ts from 'typescript';
import { Rule } from '../../rules-engine/types';
import { locOf, visit } from '../../rules-engine/engine';

const ALLOWED_METHODS = new Set(['error', 'warn']);

/** `console.log` / `console.debug` / `console.info` left in source. */
export const consoleLogRule: Rule = {
  meta: {
    id: 'smell/console-log',
    name: 'console.log left in code',
    description: 'console.log/debug/info statements should be removed before shipping.',
    category: 'code-smell',
    defaultSeverity: 'warning',
    fixable: true
  },
  run(ctx) {
    if (ctx.isTestFile) return;
    // Heuristic: skip if file looks like a CLI entry point (has shebang or uses process.argv).
    if (/^\#!/.test(ctx.sourceText) || /process\.argv/.test(ctx.sourceText)) return;

    const sf = ctx.ast as ts.SourceFile;
    visit(sf, n => {
      if (!ts.isCallExpression(n)) return;
      if (!ts.isPropertyAccessExpression(n.expression)) return;
      const obj = n.expression.expression;
      if (!ts.isIdentifier(obj) || obj.text !== 'console') return;
      const method = n.expression.name.text;
      if (ALLOWED_METHODS.has(method)) return;
      ctx.report({
        message: `Avoid leaving "console.${method}" in source code.`,
        severity: 'warning',
        location: locOf(n, sf),
        fixable: true
      });
    });
  }
};
