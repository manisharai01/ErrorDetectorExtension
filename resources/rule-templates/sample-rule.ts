/**
 * Template for adding a new rule. Copy into `src/rules/<category>/`,
 * implement `run`, then register it in `src/rules/index.ts`.
 */
import * as ts from 'typescript';
import { Rule } from '../../src/rules-engine/types';
import { locOf, visit } from '../../src/rules-engine/engine';

export const myCustomRule: Rule = {
  meta: {
    id: 'custom/my-rule',
    name: 'My custom rule',
    description: 'Describe what the rule detects.',
    category: 'code-smell',
    defaultSeverity: 'info'
  },
  run(ctx) {
    const sf = ctx.ast as ts.SourceFile;
    visit(sf, node => {
      // Example: report any `debugger;` statement.
      if (node.kind === ts.SyntaxKind.DebuggerStatement) {
        ctx.report({
          message: 'Avoid leaving `debugger` statements in code.',
          severity: 'warning',
          location: locOf(node, sf)
        });
      }
    });
  }
};
