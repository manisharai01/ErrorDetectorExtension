/**
 * IED-Q008 — fmt-println (Go)
 *
 * `fmt.Println` / `fmt.Printf` / `fmt.Print` write directly to stdout and are
 * usually debugging leftovers; production code should use a structured logger.
 * Relaxed inside test files.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext
} from '../types';

const PRINT_METHODS = /^(Println|Printf|Print)$/;

export const fmtPrintlnRule: Rule = {
  id: 'IED-Q008',
  name: 'fmt-println',
  category: 'quality',
  severity: Severity.Warning,
  languages: ['go'],
  description: 'fmt.Print* call left in code; use a logger.',
  docs: [
    '# fmt-println (IED-Q008)',
    '',
    '`fmt.Print*` writes straight to stdout and is usually debugging output:',
    '',
    '```go',
    'fmt.Println("user:", user) // flagged',
    '```',
    '',
    'Use a structured logger (`log`, `slog`, zap, ...) instead. Relaxed in tests.'
  ].join('\n'),

  nodeTypes: () => ['call_expression'],

  run(ctx: RuleContext): void {
    if (ctx.isTestFile) return;
    for (const call of ctx.nodesOfType('call_expression')) {
      const fn = call.childForFieldName('function');
      if (!fn || fn.type !== 'selector_expression') continue;
      const pkg = fn.childForFieldName('operand');
      if (!pkg || pkg.type !== 'identifier' || pkg.text !== 'fmt') continue;
      const method = fn.childForFieldName('field');
      if (!method || method.type !== 'field_identifier' || !PRINT_METHODS.test(method.text)) continue;
      if (ctx.isSuppressed(call.startPosition.row, 'IED-Q008')) continue;
      ctx.report({
        message: `Remove fmt.${method.text} before shipping (use a logger).`,
        severity: Severity.Warning,
        range: nodeRange(call),
        data: { method: method.text }
      });
    }
  }
};
