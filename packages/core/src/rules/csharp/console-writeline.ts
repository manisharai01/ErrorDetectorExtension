/**
 * IED-Q017 — console-writeline (C#)
 *
 * `Console.WriteLine`/`Console.Write` calls are almost always leftover debug
 * output: no log levels, no configuration, no routing. This rule flags them so
 * they can be replaced with a logging framework (e.g. `ILogger`). Relaxed in
 * test files, where writing to the console is common.
 *
 * The match is an `invocation_expression` whose
 * `function: (member_access_expression expression: (identifier) name: (identifier))`
 * has expression `Console` and name `Write`/`WriteLine`.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const WRITE_METHODS = new Set(['Write', 'WriteLine']);

export const consoleWriteLineRule: Rule = {
  id: 'IED-Q017',
  name: 'console-writeline',
  category: 'quality',
  severity: Severity.Info,
  languages: ['csharp'],
  description: 'Flags Console.Write/WriteLine debug output.',
  docs: [
    '# console-writeline (IED-Q017)',
    '',
    '`Console.WriteLine` bypasses the logging framework — no levels, no',
    'configuration, no routing — and tends to linger in production code.',
    '',
    '```csharp',
    'Console.WriteLine($"user {id} logged in"); // flagged',
    '```',
    '',
    'Use a logger (`ILogger.LogInformation(...)`). Relaxed in test files.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    if (ctx.isTestFile) return;

    const walk = (node: TSNode): void => {
      if (node.type === 'invocation_expression') {
        const fn = node.childForFieldName('function');
        if (fn && fn.type === 'member_access_expression') {
          const expr = fn.childForFieldName('expression');
          const name = fn.childForFieldName('name');
          if (
            expr?.type === 'identifier' &&
            expr.text === 'Console' &&
            name &&
            WRITE_METHODS.has(name.text)
          ) {
            if (!ctx.isSuppressed(node.startPosition.row, 'IED-Q017')) {
              ctx.report({
                message: 'Use a logger instead of Console.' + name.text + '.',
                severity: Severity.Info,
                range: nodeRange(node),
                data: { method: name.text }
              });
            }
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
