/**
 * IED-S018 — unserialize-user-input (PHP)
 *
 * Flags `unserialize(...)` calls whose argument references untrusted input:
 * a superglobal (`$_GET`/`$_POST`/`$_REQUEST`/`$_COOKIE`) or, conservatively,
 * any `variable_name`. `unserialize()` on attacker-controlled data enables PHP
 * object injection (arbitrary object instantiation + `__wakeup`/`__destruct`
 * gadget chains).
 *
 * The argument is `function_call_expression > arguments > argument > <expr>`.
 * We treat the call as risky if any `variable_name` appears in that argument
 * subtree (covers `$_GET['x']` subscripts and bare `$data`).
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const SUPERGLOBALS = new Set(['_GET', '_POST', '_REQUEST', '_COOKIE']);

/** True if subtree contains any variable_name; reports whether a superglobal was seen. */
function scanForVariable(node: TSNode): { hasVariable: boolean; superglobal: string | null } {
  let hasVariable = false;
  let superglobal: string | null = null;
  const walk = (n: TSNode): void => {
    if (n.type === 'variable_name') {
      hasVariable = true;
      // `variable_name`'s identifier is a named child, not a field.
      const name = n.namedChild(0)?.text ?? '';
      if (SUPERGLOBALS.has(name) && !superglobal) superglobal = name;
    }
    for (let i = 0; i < n.childCount; i++) {
      const child = n.child(i);
      if (child) walk(child);
    }
  };
  walk(node);
  return { hasVariable, superglobal };
}

export const unserializeUserInputRule: Rule = {
  id: 'IED-S018',
  name: 'unserialize-user-input',
  category: 'security',
  severity: Severity.Error,
  languages: ['php'],
  description: 'unserialize() called on a variable or superglobal (untrusted input).',
  docs: [
    '# unserialize-user-input (IED-S018)',
    '',
    'Calling `unserialize()` on attacker-controlled data enables PHP object',
    'injection. Use `json_decode()` for data interchange, or pass',
    '`["allowed_classes" => false]` when you must unserialize untrusted input.',
    '',
    '```php',
    '$obj = unserialize($_GET["data"]); // flagged',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (node.type === 'function_call_expression') {
        const fn = node.childForFieldName('function');
        if (fn?.type === 'name' && fn.text === 'unserialize') {
          const args = node.childForFieldName('arguments');
          const firstArg = args?.namedChild(0); // (argument ...)
          if (firstArg) {
            const { hasVariable, superglobal } = scanForVariable(firstArg);
            if (hasVariable) {
              const row = node.startPosition.row;
              if (!ctx.isSuppressed(row, 'IED-S018')) {
                ctx.report({
                  message:
                    'unserialize() on untrusted input enables object injection.',
                  severity: Severity.Error,
                  range: nodeRange(node),
                  data: { superglobal: superglobal ?? undefined }
                });
              }
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
