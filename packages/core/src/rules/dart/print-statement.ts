/**
 * IED-Q019 — print-statement (Dart)
 *
 * Flags `print(...)` calls left in Dart / Flutter code. `print` output is not
 * stripped from release builds and floods the device log; production code
 * should go through a logger (or `debugPrint` / `log` for debug output).
 *
 * Dart's grammar has no call node: a call is a callee followed by a `selector`
 * holding the `argument_part`, so `print('x')` is
 * `(identifier "print") (selector (argument_part …))` as siblings. A method
 * named print (`logger.print(…)`) has a member selector before the arguments
 * instead of a bare identifier, so it is not matched. Relaxed in test files.
 */

import {
  Severity,
  type Rule,
  type RuleContext
} from '../types';

export const dartPrintRule: Rule = {
  id: 'IED-Q019',
  name: 'print-statement',
  category: 'quality',
  severity: Severity.Warning,
  languages: ['dart'],
  description: 'print() call left in Dart code.',
  docs: [
    '# print-statement (IED-Q019)',
    '',
    '`print` output ships in release builds and floods the device log. Use a',
    'logger, or `debugPrint` / `dart:developer` `log` for debug-only output.',
    '',
    '```dart',
    "print('token: $token'); // flagged",
    "log('token refreshed');  // ok",
    '```',
    '',
    'Relaxed in test files. Suppress with `// ied-disable-next-line IED-Q019 <reason>`.'
  ].join('\n'),

  nodeTypes: () => ['selector'],

  run(ctx: RuleContext): void {
    if (ctx.isTestFile) return;
    for (const selector of ctx.nodesOfType('selector')) {
      if (selector.namedChild(0)?.type !== 'argument_part') continue;
      const callee = selector.previousSibling;
      if (!callee || callee.type !== 'identifier' || callee.text !== 'print') continue;
      if (ctx.isSuppressed(callee.startPosition.row, 'IED-Q019')) continue;
      ctx.report({
        message: 'Remove print() before shipping — use a logger or debugPrint.',
        severity: Severity.Warning,
        range: {
          start: { row: callee.startPosition.row, column: callee.startPosition.column },
          end: { row: selector.endPosition.row, column: selector.endPosition.column }
        }
      });
    }
  }
};
