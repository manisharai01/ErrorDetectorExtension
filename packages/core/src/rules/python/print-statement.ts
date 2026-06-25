/**
 * IED-Q009 — print-statement
 *
 * Flags `print(...)` calls left in source. They are usually debugging leftovers;
 * use the `logging` module in shipped code. Relaxed inside test files.
 */

import {
  Severity,
  capture,
  nodeRange,
  type Rule,
  type RuleContext
} from '../types';

export const printStatementRule: Rule = {
  id: 'IED-Q009',
  name: 'print-statement',
  category: 'quality',
  severity: Severity.Warning,
  languages: ['python'],
  description: 'A `print()` call left in non-test code.',
  docs: [
    '# print-statement (IED-Q009)',
    '',
    '`print()` calls are usually debugging leftovers. Use the `logging` module so',
    'output level and destination are configurable.',
    '',
    '```py',
    'print(user.token)  # flagged',
    '```',
    '',
    'Relaxed inside test files. Suppress with `# ied-disable-next-line IED-Q009`.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    if (ctx.isTestFile) return;
    const matches = ctx.query(`
      (call
        function: (identifier) @fn
        (#eq? @fn "print")) @call
    `);
    for (const m of matches) {
      const call = capture(m, 'call');
      if (!call) continue;
      if (ctx.isSuppressed(call.startPosition.row, 'IED-Q009')) continue;
      ctx.report({
        message: 'Remove print() before shipping.',
        severity: Severity.Warning,
        range: nodeRange(call)
      });
    }
  }
};
