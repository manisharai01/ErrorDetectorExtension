/**
 * IED-T005 — unchecked-error (Go)
 *
 * Go returns errors as values; discarding them with the blank identifier `_`
 * hides failures. This rule flags two cases:
 *   (a) `f, _ := os.Open(path)` — an error explicitly assigned to `_` from a
 *       call (the reliable case).
 *   (b) a bare call statement to a function from a small known set that returns
 *       an error which is then thrown away (conservative heuristic).
 *
 * Walk-based: we need parent/child relationships that queries express awkwardly.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

/**
 * Common stdlib calls whose sole/last return is an `error` and that are often
 * called for effect with the result discarded. Kept intentionally small and
 * conservative to avoid false positives.
 */
const ERROR_RETURNING_CALLS = new Set([
  'os.Remove',
  'os.RemoveAll',
  'os.Setenv',
  'os.Mkdir',
  'os.MkdirAll',
  'os.Chmod',
  'os.Rename',
  'os.Chdir'
]);

function selectorText(call: TSNode): string | null {
  const fn = call.childForFieldName('function');
  if (!fn || fn.type !== 'selector_expression') return null;
  const operand = fn.childForFieldName('operand');
  const field = fn.childForFieldName('field');
  if (!operand || !field) return null;
  return `${operand.text}.${field.text}`;
}

export const uncheckedErrorRule: Rule = {
  id: 'IED-T005',
  name: 'unchecked-error',
  category: 'type-safety',
  severity: Severity.Warning,
  languages: ['go'],
  description: 'A returned error is discarded with the blank identifier.',
  docs: [
    '# unchecked-error (IED-T005)',
    '',
    'Go reports failures as `error` return values. Discarding them with `_`',
    'silences real problems.',
    '',
    '```go',
    'f, _ := os.Open(path) // flagged: error ignored',
    'os.Remove(path)       // flagged: error return dropped',
    '```',
    '',
    'Handle the error: `if err != nil { ... }`.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      // Case (a): short_var_declaration with `_` on the left and a call on the right.
      if (node.type === 'short_var_declaration') {
        const left = node.childForFieldName('left');
        const right = node.childForFieldName('right');
        if (left && right) {
          // Right side must contain a call expression.
          const rightHasCall = (() => {
            for (let i = 0; i < right.namedChildCount; i++) {
              if (right.namedChild(i)?.type === 'call_expression') return true;
            }
            return false;
          })();
          if (rightHasCall) {
            for (let i = 0; i < left.namedChildCount; i++) {
              const item = left.namedChild(i);
              if (item && item.type === 'identifier' && item.text === '_') {
                if (!ctx.isSuppressed(item.startPosition.row, 'IED-T005')) {
                  ctx.report({
                    message: 'Error discarded with `_`; handle the returned error.',
                    severity: Severity.Warning,
                    range: nodeRange(item),
                    data: { kind: 'blank-assign' }
                  });
                }
              }
            }
          }
        }
      }

      // Case (b): bare call statement to a known error-returning function.
      if (node.type === 'expression_statement') {
        const expr = node.namedChild(0);
        if (expr && expr.type === 'call_expression') {
          const name = selectorText(expr);
          if (name && ERROR_RETURNING_CALLS.has(name)) {
            if (!ctx.isSuppressed(expr.startPosition.row, 'IED-T005')) {
              ctx.report({
                message: `Return value of ${name} is an error that is not checked.`,
                severity: Severity.Warning,
                range: nodeRange(expr),
                data: { kind: 'dropped-return', call: name }
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
