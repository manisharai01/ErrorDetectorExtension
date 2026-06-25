/**
 * IED-Q001 — console-log
 *
 * Flags `console.log/.warn/.error/.info/.debug/.trace` calls left in source.
 * Relaxed in test files. Auto-fixable: removes the whole statement.
 */

import {
  Severity,
  capture,
  nodeRange,
  type Rule,
  type RuleContext,
  type Diagnostic,
  type TextEdit
} from '../types';

const CONSOLE_METHODS = '^(log|warn|error|info|debug|trace)$';

export const consoleLogRule: Rule = {
  id: 'IED-Q001',
  name: 'console-log',
  category: 'quality',
  severity: Severity.Warning,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue'],
  description: 'Console logging left in code.',
  docs: [
    '# console-log (IED-Q001)',
    '',
    'Calls to `console.*` are usually debugging leftovers and should not ship.',
    '',
    '```js',
    'console.log(user.token); // flagged',
    '```',
    '',
    'Relaxed inside test files. Suppress with `// ied-disable-next-line IED-Q001`.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    if (ctx.isTestFile) return;
    const matches = ctx.query(`
      (call_expression
        function: (member_expression
          object: (identifier) @obj
          property: (property_identifier) @method)
        (#eq? @obj "console")
        (#match? @method "${CONSOLE_METHODS}")) @call
    `);
    for (const m of matches) {
      const call = capture(m, 'call');
      const method = capture(m, 'method');
      if (!call || !method) continue;
      if (ctx.isSuppressed(call.startPosition.row, 'IED-Q001')) continue;
      ctx.report({
        message: `Remove console.${method.text} before shipping.`,
        severity: Severity.Warning,
        range: nodeRange(call),
        data: { method: method.text }
      });
    }
  },

  fix(diagnostic: Diagnostic, sourceCode: string): TextEdit[] | null {
    // Remove the full line(s) the call spans, including a trailing newline.
    const lines = sourceCode.split('\n');
    const startRow = diagnostic.range.start.row;
    const endRow = diagnostic.range.end.row;
    let startIndex = 0;
    for (let i = 0; i < startRow; i++) startIndex += lines[i].length + 1;
    let endIndex = startIndex;
    for (let i = startRow; i <= endRow; i++) endIndex += lines[i].length + 1;
    return [{ startIndex, endIndex, newText: '' }];
  }
};
