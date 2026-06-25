/**
 * IED-L011 — mutable-default-arg
 *
 * Flags Python function parameters whose default value is a mutable literal
 * (`[]`, `{}`, `set()` via `{..}`, or a tuple-of-mutables is intentionally
 * excluded). The default is evaluated once at definition time, so it is shared
 * across calls — a classic Python footgun.
 */

import {
  Severity,
  capture,
  nodeRange,
  type Rule,
  type RuleContext
} from '../types';

const MUTABLE_LITERALS = new Set(['list', 'dictionary', 'set']);

export const mutableDefaultArgRule: Rule = {
  id: 'IED-L011',
  name: 'mutable-default-arg',
  category: 'logic',
  severity: Severity.Warning,
  languages: ['python'],
  description: 'Mutable value used as a function default argument.',
  docs: [
    '# mutable-default-arg (IED-L011)',
    '',
    'A default argument is evaluated once, when the function is defined, so a',
    'mutable default (`[]`, `{}`, `{1}`) is shared across every call.',
    '',
    '```py',
    'def f(items=[]):  # flagged — the same list persists between calls',
    '    items.append(1)',
    '```',
    '',
    'Use `None` as the sentinel and create the value inside the body instead.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const matches = ctx.query(`
      (default_parameter
        value: [(list) (dictionary) (set)] @value) @param
    `);
    for (const m of matches) {
      const param = capture(m, 'param');
      const value = capture(m, 'value');
      if (!param || !value) continue;
      if (!MUTABLE_LITERALS.has(value.type)) continue;
      if (ctx.isSuppressed(param.startPosition.row, 'IED-L011')) continue;
      ctx.report({
        message: `Mutable default \`${value.type === 'dictionary' ? '{}' : value.type === 'set' ? '{...}' : '[]'}\` is shared across calls. Use None and build it in the body.`,
        severity: Severity.Warning,
        range: nodeRange(param),
        data: { kind: value.type }
      });
    }
  }
};
