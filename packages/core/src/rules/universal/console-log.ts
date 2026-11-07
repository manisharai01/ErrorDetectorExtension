/**
 * IED-Q001 — console-log
 *
 * Flags `console.log/.warn/.error/.info/.debug/.trace` calls left in source.
 * Relaxed in test files. Auto-fixable: removes the whole statement.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type Diagnostic,
  type TextEdit
} from '../types';

const CONSOLE_METHODS = /^(log|warn|error|info|debug|trace)$/;

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

  nodeTypes: () => ['call_expression'],

  run(ctx: RuleContext): void {
    if (ctx.isTestFile) return;
    for (const call of ctx.nodesOfType('call_expression')) {
      const fn = call.childForFieldName('function');
      if (!fn || fn.type !== 'member_expression') continue;
      const obj = fn.childForFieldName('object');
      if (!obj || obj.type !== 'identifier' || obj.text !== 'console') continue;
      const method = fn.childForFieldName('property');
      if (!method || method.type !== 'property_identifier' || !CONSOLE_METHODS.test(method.text)) continue;
      if (ctx.isSuppressed(call.startPosition.row, 'IED-Q001')) continue;
      ctx.report({
        message: `Remove console.${method.text} before shipping.`,
        severity: Severity.Warning,
        range: nodeRange(call),
        data: { method: method.text }
      });
    }
  },

  fixTitle: (d) => `Remove console.${String(d.data?.method ?? 'log')}(…) call`,

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
