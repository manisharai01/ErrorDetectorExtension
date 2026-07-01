/**
 * IED-Q014 — debug-output (PHP)
 *
 * Flags debugging dump calls (`var_dump` / `print_r` / `var_export`) left in
 * source. These leak internal state to output and are almost never intended to
 * ship. Relaxed inside test files.
 *
 * Detection: a `function_call_expression` whose `function` field is a bare
 * `name` matching one of the debug functions.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const DEBUG_FNS = new Set(['var_dump', 'print_r', 'var_export']);

export const debugOutputRule: Rule = {
  id: 'IED-Q014',
  name: 'debug-output',
  category: 'quality',
  severity: Severity.Warning,
  languages: ['php'],
  description: 'var_dump / print_r / var_export left in source.',
  docs: [
    '# debug-output (IED-Q014)',
    '',
    'Debugging dump calls leak internal state and clutter output. Remove',
    '`var_dump`, `print_r`, and `var_export` before shipping, or use a logger.',
    '',
    '```php',
    'var_dump($user); // flagged',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    if (ctx.isTestFile) return;

    const walk = (node: TSNode): void => {
      if (node.type === 'function_call_expression') {
        const fn = node.childForFieldName('function');
        if (fn?.type === 'name' && DEBUG_FNS.has(fn.text)) {
          const row = node.startPosition.row;
          if (!ctx.isSuppressed(row, 'IED-Q014')) {
            ctx.report({
              message: 'Remove var_dump/print_r before shipping.',
              severity: Severity.Warning,
              range: nodeRange(node),
              data: { fn: fn.text }
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
