/**
 * IED-Q018 — debug-output (Ruby)
 *
 * Flags leftover debug prints: `puts`, `p`, `pp`, `print` calls at statement
 * level. Relaxed for test files.
 *
 * Verified shapes:
 *   - `puts "hi"` / `p x` / `pp obj` / `print "z"` all parse as
 *       (call method:(identifier) arguments:(argument_list ...))  — no receiver.
 *   - a bare `p` (no args) parses as a plain (identifier), NOT a `call`, so it
 *     is naturally excluded (it is likely a local-variable reference).
 *
 * We only match `call` nodes with NO receiver whose method is one of the debug
 * names AND which have an `argument_list` — so `p` used as a variable is safe.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const DEBUG_METHODS = new Set(['puts', 'p', 'pp', 'print']);

export const debugOutputRubyRule: Rule = {
  id: 'IED-Q018',
  name: 'debug-output',
  category: 'quality',
  severity: Severity.Warning,
  languages: ['ruby'],
  description: 'Leftover debug print (puts / p / pp / print).',
  docs: [
    '# debug-output (IED-Q018)',
    '',
    'Debug prints (`puts`, `p`, `pp`, `print`) left in production code clutter',
    'logs and can leak information. Use a logger with proper levels instead.',
    'Relaxed in test files.',
    '',
    '```ruby',
    'puts "value = #{value}" # flagged',
    'logger.debug("value")   # ok',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    if (ctx.isTestFile) return;

    const walk = (node: TSNode): void => {
      if (node.type === 'call') {
        const receiver = node.childForFieldName('receiver');
        const method = node.childForFieldName('method');
        const args = node.childForFieldName('arguments');
        // Bare call (no receiver) to a debug method that actually has arguments.
        if (!receiver && method && DEBUG_METHODS.has(method.text) && args) {
          const row = node.startPosition.row;
          if (!ctx.isSuppressed(row, 'IED-Q018')) {
            ctx.report({
              message: `Leftover debug output \`${method.text}\` — use a logger instead.`,
              severity: Severity.Warning,
              range: nodeRange(node),
              data: { method: method.text }
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
