/**
 * IED-L006 — recursion-base-case
 *
 * Flags a recursive `function_declaration` that has no obvious base case.
 * Conservative port of the legacy `logic/recursion-base-case` rule: a function
 * is reported only when its body calls itself (by name) AND the body contains
 * no `if_statement` and no `ternary_expression` that could guard an early
 * return. This keeps false positives low.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

/**
 * True if `body` directly calls a function named `name` (a self-call), without
 * descending into nested function bodies. We use descendantsOfType for call
 * expressions and check the called identifier.
 */
function callsItself(body: TSNode, name: string): boolean {
  for (const call of body.descendantsOfType('call_expression')) {
    const fn = call.childForFieldName('function');
    if (fn && fn.type === 'identifier' && fn.text === name) return true;
  }
  return false;
}

/** True if the body has any if_statement or ternary_expression guard. */
function hasGuard(body: TSNode): boolean {
  return (
    body.descendantsOfType('if_statement').length > 0 ||
    body.descendantsOfType('ternary_expression').length > 0
  );
}

export const recursionBaseCaseRule: Rule = {
  id: 'IED-L006',
  name: 'recursion-base-case',
  category: 'logic',
  severity: Severity.Warning,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue'],
  description: 'Function calls itself without a guarded base case (no if/ternary).',
  docs: [
    '# recursion-base-case (IED-L006)',
    '',
    'A function that calls itself but has no `if` or ternary to stop recursing',
    'will overflow the stack:',
    '',
    '```js',
    'function f() { return f() + 1; } // no base case',
    '```',
    '',
    'Add a guarded early return as the base case.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (node.type === 'function_declaration') {
        const nameNode = node.childForFieldName('name');
        const body = node.childForFieldName('body');
        if (nameNode && body && nameNode.type === 'identifier') {
          const name = nameNode.text;
          if (callsItself(body, name) && !hasGuard(body)) {
            if (!ctx.isSuppressed(nameNode.startPosition.row, 'IED-L006')) {
              ctx.report({
                message: `Function "${name}" recurses but has no guarded base case (if/ternary + return).`,
                severity: Severity.Warning,
                range: nodeRange(nameNode),
                data: { function: name }
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
