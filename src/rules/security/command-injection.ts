import * as ts from 'typescript';
import { Rule } from '../../rules-engine/types';
import { locOf, visit } from '../../rules-engine/engine';

const RISKY_CALLS = new Set(['exec', 'execSync', 'spawn', 'spawnSync']);

/**
 * `child_process.exec(...)` style calls whose first argument is a template
 * string or string concatenation — high command-injection risk.
 */
export const commandInjectionRule: Rule = {
  meta: {
    id: 'security/command-injection',
    name: 'Possible command injection',
    description: 'exec/spawn called with concatenated or interpolated user input.',
    category: 'security',
    defaultSeverity: 'error'
  },
  run(ctx) {
    const sf = ctx.ast as ts.SourceFile;
    visit(sf, n => {
      if (!ts.isCallExpression(n)) return;
      let name: string | null = null;
      if (ts.isIdentifier(n.expression)) name = n.expression.text;
      else if (ts.isPropertyAccessExpression(n.expression)) name = n.expression.name.text;
      if (!name || !RISKY_CALLS.has(name)) return;

      const arg = n.arguments[0];
      if (!arg) return;
      if (ts.isTemplateExpression(arg)
          || (ts.isBinaryExpression(arg) && arg.operatorToken.kind === ts.SyntaxKind.PlusToken)) {
        ctx.report({
          message: `${name}() called with dynamic string — possible command injection.`,
          severity: 'error',
          location: locOf(n, sf),
          suggestion: 'Pass arguments as an array to spawn() instead of concatenating into a shell string.'
        });
      }
    });
  }
};
