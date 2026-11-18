/**
 * IED-Q009 — print-statement
 *
 * Flags `print(...)` calls left in source. They are usually debugging leftovers;
 * use the `logging` module in shipped code. Relaxed inside test files and in
 * command-line scripts (a module with an `if __name__ == "__main__":` guard),
 * where printing to the terminal is the program's output.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext
} from '../types';

const MAIN_GUARD = /^if\s+__name__\s*==\s*["']__main__["']\s*:/m;

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
    'Relaxed inside test files and command-line scripts (modules with an',
    '`if __name__ == "__main__":` guard). Suppress with',
    '`# ied-disable-next-line IED-Q009 <reason>`.'
  ].join('\n'),

  nodeTypes: () => ['call'],

  run(ctx: RuleContext): void {
    if (ctx.isTestFile || MAIN_GUARD.test(ctx.sourceCode)) return;
    for (const call of ctx.nodesOfType('call')) {
      const fn = call.childForFieldName('function');
      if (!fn || fn.type !== 'identifier' || fn.text !== 'print') continue;
      if (ctx.isSuppressed(call.startPosition.row, 'IED-Q009')) continue;
      ctx.report({
        message: 'Remove print() before shipping.',
        severity: Severity.Warning,
        range: nodeRange(call)
      });
    }
  }
};
