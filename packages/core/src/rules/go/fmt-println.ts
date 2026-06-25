/**
 * IED-Q008 — fmt-println (Go)
 *
 * `fmt.Println` / `fmt.Printf` / `fmt.Print` write directly to stdout and are
 * usually debugging leftovers; production code should use a structured logger.
 * Relaxed inside test files.
 */

import {
  Severity,
  capture,
  nodeRange,
  type Rule,
  type RuleContext
} from '../types';

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

  run(ctx: RuleContext): void {
    if (ctx.isTestFile) return;
    const matches = ctx.query(`
      (call_expression
        function: (selector_expression
          operand: (identifier) @pkg
          field: (field_identifier) @method)
        (#eq? @pkg "fmt")
        (#match? @method "^(Println|Printf|Print)$")) @call
    `);
    for (const m of matches) {
      const call = capture(m, 'call');
      const method = capture(m, 'method');
      if (!call || !method) continue;
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
