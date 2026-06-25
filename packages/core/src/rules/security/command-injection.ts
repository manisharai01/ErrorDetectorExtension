/**
 * IED-S004 — command-injection
 *
 * Flags `child_process` style calls (exec/execSync/spawn/spawnSync/execFile)
 * whose first argument is a template string or a string concatenation — the
 * classic shape of a shell-injection vulnerability. Ported from the legacy
 * `security/command-injection` rule.
 */

import {
  Severity,
  capture,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const RISKY_CALLS = new Set(['exec', 'execSync', 'spawn', 'spawnSync', 'execFile']);

/** True if the argument node is a template string or a `+` string concat. */
function isDynamicString(arg: TSNode): boolean {
  if (arg.type === 'template_string') return true;
  if (arg.type === 'binary_expression') {
    const op = arg.childForFieldName('operator');
    return op?.text === '+';
  }
  return false;
}

export const commandInjectionRule: Rule = {
  id: 'IED-S004',
  name: 'command-injection',
  category: 'security',
  severity: Severity.Error,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue'],
  description: 'exec/spawn called with a concatenated or interpolated command string.',
  docs: [
    '# command-injection (IED-S004)',
    '',
    'Passing a dynamically built string to `exec`/`spawn` lets an attacker who',
    'controls part of the string run arbitrary shell commands. Pass arguments',
    'as an array to `spawn()` / `execFile()` instead of concatenating a shell',
    'string.',
    '',
    '```js',
    'exec(`rm -rf ${dir}`); // flagged',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const matches = ctx.query('(call_expression) @call');

    for (const m of matches) {
      const call = capture(m, 'call');
      if (!call) continue;

      const fn = call.childForFieldName('function');
      if (!fn) continue;

      let name: string | null = null;
      if (fn.type === 'identifier') {
        name = fn.text;
      } else if (fn.type === 'member_expression') {
        name = fn.childForFieldName('property')?.text ?? null;
      }
      if (!name || !RISKY_CALLS.has(name)) continue;

      const args = call.childForFieldName('arguments');
      const firstArg = args?.namedChild(0);
      if (!firstArg || !isDynamicString(firstArg)) continue;

      if (ctx.isSuppressed(call.startPosition.row, 'IED-S004')) continue;
      ctx.report({
        message: `${name}() called with a dynamic string — possible command injection.`,
        severity: Severity.Error,
        range: nodeRange(call),
        data: { callee: name }
      });
    }
  }
};
