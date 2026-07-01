/**
 * IED-S017 — sql-injection (PHP)
 *
 * Flags SQL queries built by mixing a string literal that contains SQL
 * keywords with a PHP variable, then handed to a db call or assigned to a
 * `$sql`/`$query` variable. Two shapes are detected:
 *
 *   1. A `binary_expression` whose operator is `.` (PHP string concat) where
 *      one side is a string literal containing SQL keywords and the other side
 *      references a `variable_name`.
 *   2. A double-quoted `encapsed_string` that contains SQL keywords AND an
 *      interpolated variable (an inner `variable_name`).
 *
 * The tainted expression is reported when it is passed to a `query`/`exec`/
 * `prepare` member call or assigned to a `$sql`/`$query`-named variable.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const SQL_KEYWORDS = /\b(SELECT|INSERT|UPDATE|DELETE|WHERE|FROM)\b/i;
const DB_METHODS = new Set(['query', 'exec', 'prepare']);
const SQL_VAR_NAMES = new Set(['sql', 'query']);

const STRING_NODES = new Set(['encapsed_string', 'string']);

/** True if a node is a PHP string literal. */
function isStringLiteral(node: TSNode): boolean {
  return STRING_NODES.has(node.type);
}

/** True if the subtree contains a `variable_name` anywhere. */
function containsVariable(node: TSNode): boolean {
  if (node.type === 'variable_name') return true;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && containsVariable(child)) return true;
  }
  return false;
}

/**
 * Decide whether `expr` is a tainted SQL string: a `.` concat that joins a
 * SQL-keyword string literal with a variable, or an interpolated SQL string.
 */
function isTaintedSql(expr: TSNode): boolean {
  if (expr.type === 'binary_expression') {
    const op = expr.childForFieldName('operator');
    if (op?.text !== '.') return false;
    const left = expr.childForFieldName('left');
    const right = expr.childForFieldName('right');
    if (!left || !right) return false;
    const literalSide = [left, right].find(
      (n) => isStringLiteral(n) && SQL_KEYWORDS.test(n.text)
    );
    if (!literalSide) return false;
    // The other side (or the literal itself, when interpolated) must include a var.
    return containsVariable(expr);
  }
  if (expr.type === 'encapsed_string') {
    // Interpolated double-quoted string with SQL keywords and an inner variable.
    return SQL_KEYWORDS.test(expr.text) && containsVariable(expr);
  }
  return false;
}

export const sqlInjectionRule: Rule = {
  id: 'IED-S017',
  name: 'sql-injection',
  category: 'security',
  severity: Severity.Error,
  languages: ['php'],
  description: 'SQL query built with string concatenation or interpolation of a variable.',
  docs: [
    '# sql-injection (IED-S017)',
    '',
    'Building a SQL statement by concatenating or interpolating user-controlled',
    'variables lets an attacker alter the query. Use parameterized queries /',
    'prepared statements with bound parameters instead.',
    '',
    '```php',
    '$db->query("SELECT * FROM users WHERE id = " . $id); // flagged',
    '$db->prepare("SELECT * FROM users WHERE id = ?");     // ok',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const seen = new Set<string>();

    const report = (node: TSNode): void => {
      const row = node.startPosition.row;
      const key = `${row}:${node.startPosition.column}`;
      if (seen.has(key)) return;
      if (ctx.isSuppressed(row, 'IED-S017')) return;
      seen.add(key);
      ctx.report({
        message: 'Possible SQL injection — use parameterized queries.',
        severity: Severity.Error,
        range: nodeRange(node),
        data: {}
      });
    };

    const walk = (node: TSNode): void => {
      // db call: $db->query(<tainted>) / ->exec / ->prepare
      if (node.type === 'member_call_expression') {
        const name = node.childForFieldName('name');
        if (name && DB_METHODS.has(name.text)) {
          const args = node.childForFieldName('arguments');
          const firstArg = args?.namedChild(0);
          const inner = firstArg?.namedChild(0); // unwrap (argument ...)
          if (inner && isTaintedSql(inner)) report(inner);
        }
      }

      // assignment: $sql = <tainted> / $query = <tainted>
      if (node.type === 'assignment_expression') {
        const left = node.childForFieldName('left');
        const right = node.childForFieldName('right');
        if (left?.type === 'variable_name') {
          // `variable_name`'s identifier is a named child, not a field.
          const varName = left.namedChild(0)?.text ?? '';
          if (SQL_VAR_NAMES.has(varName.toLowerCase()) && right && isTaintedSql(right)) {
            report(right);
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
