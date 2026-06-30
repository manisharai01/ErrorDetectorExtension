/**
 * IED-Q011 — println-statement (Kotlin)
 *
 * Kotlin's top-level `println`/`print` write straight to stdout and are almost
 * always debugging leftovers; production code should route through a logger
 * (SLF4J, Timber, `java.util.logging`, …). Relaxed inside test files.
 *
 * NODE SHAPE (verified):
 *   println("hi") ->
 *     (call_expression (simple_identifier) (call_suffix (value_arguments …)))
 * The top-level functions appear as a *bare* `simple_identifier` callee. A
 * member call like `logger.println(…)` has a `navigation_expression` callee
 * instead, so checking for a direct `simple_identifier` first child naturally
 * excludes `System.out.println`, `writer.print`, etc.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const STDOUT_FUNCS = new Set(['println', 'print']);

export const printlnStatementRule: Rule = {
  id: 'IED-Q011',
  name: 'println-statement',
  category: 'quality',
  severity: Severity.Warning,
  languages: ['kotlin'],
  description: 'println/print call left in code; use a logger.',
  docs: [
    '# println-statement (IED-Q011)',
    '',
    "Kotlin's `println`/`print` go straight to stdout and are usually debug",
    'output:',
    '',
    '```kotlin',
    'println("user=$user") // flagged',
    '```',
    '',
    'Use a logger instead (SLF4J, Timber, `java.util.logging`). Relaxed in tests.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    if (ctx.isTestFile) return;

    const walk = (node: TSNode): void => {
      if (node.type === 'call_expression') {
        const callee = node.child(0);
        if (
          callee &&
          callee.type === 'simple_identifier' &&
          STDOUT_FUNCS.has(callee.text) &&
          !ctx.isSuppressed(node.startPosition.row, 'IED-Q011')
        ) {
          ctx.report({
            message: `Remove ${callee.text} before shipping (use a logger).`,
            severity: Severity.Warning,
            range: nodeRange(node),
            data: { func: callee.text }
          });
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child);
      }
    };

    walk(ctx.tree.rootNode);
  }
};
