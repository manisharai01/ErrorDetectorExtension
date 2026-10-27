/**
 * IED-S021 — eval-usage (Ruby)
 *
 * Flags calls to `eval`, `instance_eval`, `class_eval`, `module_eval` whose
 * argument is NOT a plain string literal (i.e. contains a variable / identifier
 * / interpolation). A constant-literal `eval("1 + 1")` is left alone.
 *
 * Verified shapes:
 *   - `eval(x)`               → (call method:(identifier "eval")
 *       arguments:(argument_list (identifier)))  — no receiver
 *   - `obj.instance_eval(c)`  → (call receiver method:(identifier) arguments:...)
 *   - `eval("1 + 1")`         → argument is a (string (string_content)) with no
 *       interpolation → treated as a safe literal, not flagged.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const EVAL_METHODS = new Set(['eval', 'instance_eval', 'class_eval', 'module_eval']);

/** True if the string subtree interpolates (`#{...}`). */
function hasInterpolation(node: TSNode): boolean {
  if (node.type === 'interpolation') return true;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && hasInterpolation(child)) return true;
  }
  return false;
}

/** A safe literal argument is a `string` with no interpolation. */
function isSafeLiteral(node: TSNode): boolean {
  return node.type === 'string' && !hasInterpolation(node);
}

export const evalUsageRubyRule: Rule = {
  id: 'IED-S021',
  name: 'eval-usage',
  category: 'security',
  severity: Severity.Error,
  languages: ['ruby'],
  description: 'eval / instance_eval / class_eval / module_eval called with a non-literal argument.',
  docs: [
    '# eval-usage (IED-S021)',
    '',
    'Passing dynamic (non-literal) code to `eval` and its cousins allows',
    'arbitrary code execution. Only a constant string literal argument is',
    'considered safe here; anything containing a variable or interpolation is',
    'flagged.',
    '',
    '```ruby',
    'eval(user_input)        # flagged',
    'obj.instance_eval(code) # flagged',
    'eval("1 + 1")           # ok (constant literal)',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (node.type === 'call') {
        const method = node.childForFieldName('method');
        if (method && EVAL_METHODS.has(method.text)) {
          const args = node.childForFieldName('arguments');
          const first = args?.namedChild(0);
          // Flag when there IS an argument and it is not a safe string literal.
          if (first && !isSafeLiteral(first)) {
            const row = node.startPosition.row;
            if (!ctx.isSuppressed(row, 'IED-S021')) {
              ctx.report({
                message: `Dynamic \`${method.text}\` on a non-literal argument allows arbitrary code execution.`,
                severity: Severity.Error,
                range: nodeRange(node),
                data: { method: method.text }
              });
            }
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
