/**
 * IED-L020 — rescue-swallow (Ruby)
 *
 * Flags a `rescue` clause with an empty body — it silently swallows the
 * exception, hiding failures.
 *
 * Verified tree-sitter-ruby shapes:
 *   - `rescue => e` (empty)        → (rescue variable:(exception_variable ...))
 *       — NO `body` field.
 *   - `rescue` (bare, empty)       → (rescue)
 *   - `rescue StandardError => e`  → (rescue exceptions:(exceptions ...) variable:...)
 *   - `rescue => e\n log(e)`       → (rescue variable:... body:(then ...))
 *   - comment-only body            → (rescue variable:... (comment)) — still NO
 *       `body` field, so it is (correctly) treated as swallowing.
 *
 * So: a `rescue` node is a swallow iff it has no `body` field.
 */

import {
  Severity,
  nodeRange,
  capture,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

export const rescueSwallowRule: Rule = {
  id: 'IED-L020',
  name: 'rescue-swallow',
  category: 'logic',
  severity: Severity.Warning,
  languages: ['ruby'],
  description: 'Empty rescue clause silently swallows the exception.',
  docs: [
    '# rescue-swallow (IED-L020)',
    '',
    'An empty `rescue` discards the exception, hiding failures and making bugs',
    'hard to diagnose. At minimum log the error, or re-raise if you cannot',
    'handle it.',
    '',
    '```ruby',
    'begin',
    '  risky',
    'rescue => e',
    'end          # flagged — exception swallowed',
    '',
    'begin',
    '  risky',
    'rescue => e',
    '  logger.error(e) # ok',
    'end',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    // The executable body of a rescue is a `then` child; header parts
    // (`exceptions`, `exception_variable`) and `comment` nodes are not a body.
    // We use queries rather than a manual walk because rescue node handles read
    // inconsistently through the shared traversal cursor. A rescue with a `then`
    // body is safe; every other rescue swallows the exception.
    //
    // We key by start position to subtract the "has body" set from all rescues.
    const key = (n: TSNode): string => `${n.startPosition.row}:${n.startPosition.column}`;

    const withBody = new Set<string>();
    for (const m of ctx.query('(rescue body: (then)) @r')) {
      const r = capture(m, 'r');
      if (r) withBody.add(key(r));
    }

    for (const m of ctx.query('(rescue) @r')) {
      const r = capture(m, 'r');
      if (!r || withBody.has(key(r))) continue;
      const row = r.startPosition.row;
      if (ctx.isSuppressed(row, 'IED-L020')) continue;
      ctx.report({
        message: 'Empty rescue silently swallows the exception — log or re-raise it.',
        severity: Severity.Warning,
        range: nodeRange(r),
        data: {}
      });
    }
  }
};
