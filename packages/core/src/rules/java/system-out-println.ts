/**
 * IED-Q010 — system-out-println (Java)
 *
 * `System.out`/`System.err` print calls bypass the application's logging
 * framework: no levels, no formatting, no routing, and they are easy to leave
 * behind in production code. This rule flags `System.out.println(...)`,
 * `.print(...)`, and `.printf(...)`.
 *
 * Relaxed inside test files, where ad-hoc printing is common.
 *
 * The match is a `method_invocation` whose `object:` is the `field_access`
 * `System.out` and whose `name:` is one of the print methods.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const PRINT_METHODS = new Set(['println', 'print', 'printf']);

/** True if `node` is the `System.out` field-access expression. */
function isSystemOut(node: TSNode | null): boolean {
  if (!node || node.type !== 'field_access') return false;
  const object = node.childForFieldName('object');
  const field = node.childForFieldName('field');
  return object?.text === 'System' && field?.text === 'out';
}

export const systemOutPrintlnRule: Rule = {
  id: 'IED-Q010',
  name: 'system-out-println',
  category: 'quality',
  severity: Severity.Warning,
  languages: ['java'],
  description: 'Uses System.out printing instead of a logger.',
  docs: [
    '# system-out-println (IED-Q010)',
    '',
    '`System.out` printing bypasses the logging framework — no levels, no',
    'configuration, no routing — and tends to linger in production code.',
    '',
    '```java',
    'System.out.println("user " + id); // flagged',
    '```',
    '',
    'Use a logger (e.g. SLF4J `log.info(...)`). Relaxed in test files.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    if (ctx.isTestFile) return;

    const walk = (node: TSNode): void => {
      if (node.type === 'method_invocation') {
        const name = node.childForFieldName('name')?.text;
        const object = node.childForFieldName('object');
        if (name && PRINT_METHODS.has(name) && isSystemOut(object)) {
          if (!ctx.isSuppressed(node.startPosition.row, 'IED-Q010')) {
            ctx.report({
              message: 'Use a logger instead of System.out.',
              severity: Severity.Warning,
              range: nodeRange(node),
              data: { method: name }
            });
          }
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
