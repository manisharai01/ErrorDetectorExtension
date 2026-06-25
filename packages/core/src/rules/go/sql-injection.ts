/**
 * IED-S014 — sql-injection (Go)
 *
 * Building a SQL string by concatenating a non-literal (user input, a variable)
 * and passing it to db.Query/QueryRow/Exec is a classic SQL-injection sink.
 * Use parameterized queries (`?` / `$1` placeholders) instead.
 *
 * We flag a `call_expression` to a `selector_expression` whose field is one of
 * {Query, QueryRow, Exec, QueryContext, QueryRowContext, ExecContext} where the
 * first SQL argument is a `binary_expression` with `+` involving a non-literal.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const SQL_METHODS = new Set([
  'Query',
  'QueryRow',
  'Exec',
  'QueryContext',
  'QueryRowContext',
  'ExecContext'
]);

const STRING_LITERAL_TYPES = new Set([
  'interpreted_string_literal',
  'raw_string_literal'
]);

/**
 * True if `expr` is a `+` concatenation that mixes a string literal with a
 * non-literal (i.e. real interpolation, not "a" + "b" constant folding).
 */
function isTaintedConcat(expr: TSNode): boolean {
  if (expr.type !== 'binary_expression') return false;
  const op = expr.childForFieldName('operator');
  if (!op || op.text !== '+') return false;

  let hasLiteral = false;
  let hasNonLiteral = false;

  const visit = (node: TSNode): void => {
    if (node.type === 'binary_expression') {
      const o = node.childForFieldName('operator');
      if (o && o.text === '+') {
        const l = node.childForFieldName('left');
        const r = node.childForFieldName('right');
        if (l) visit(l);
        if (r) visit(r);
        return;
      }
    }
    if (STRING_LITERAL_TYPES.has(node.type)) {
      hasLiteral = true;
    } else if (node.type === 'int_literal' || node.type === 'float_literal') {
      // numeric literal: still constant, ignore
    } else {
      hasNonLiteral = true;
    }
  };

  visit(expr);
  return hasLiteral && hasNonLiteral;
}

export const sqlInjectionRule: Rule = {
  id: 'IED-S014',
  name: 'sql-injection',
  category: 'security',
  severity: Severity.Error,
  languages: ['go'],
  description: 'SQL query built with string concatenation of a non-literal.',
  docs: [
    '# sql-injection (IED-S014)',
    '',
    'Concatenating untrusted values into a SQL string allows injection:',
    '',
    '```go',
    'db.Query("SELECT * FROM users WHERE id = " + id) // flagged',
    '```',
    '',
    'Use a parameterized query instead:',
    '',
    '```go',
    'db.Query("SELECT * FROM users WHERE id = ?", id)',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (node.type === 'call_expression') {
        const fn = node.childForFieldName('function');
        if (fn && fn.type === 'selector_expression') {
          const field = fn.childForFieldName('field');
          if (field && SQL_METHODS.has(field.text)) {
            const args = node.childForFieldName('arguments');
            const firstArg = args?.namedChild(0);
            if (firstArg && isTaintedConcat(firstArg)) {
              if (!ctx.isSuppressed(node.startPosition.row, 'IED-S014')) {
                ctx.report({
                  message:
                    `SQL query built via string concatenation in .${field.text}(); ` +
                    'use a parameterized query.',
                  severity: Severity.Error,
                  range: nodeRange(node),
                  data: { method: field.text }
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
