/**
 * IED-S020 — sql-injection (Ruby)
 *
 * Flags a SQL string built with interpolation (`#{...}`) that is either passed
 * to a DB method (`execute`/`query`/`where`/`find_by_sql`/`exec_query`) or
 * assigned to a variable named `sql`/`query`.
 *
 * Verified tree-sitter-ruby shapes:
 *   - `db.execute("... #{id}")`  → (call receiver method arguments:
 *       (argument_list (string (string_content) (interpolation ...))))
 *   - `sql = "... #{name}"`      → (assignment left:(identifier)
 *       right:(string ... (interpolation ...)))
 *
 * Conservative: a string is only tainted when it contains BOTH an
 * `interpolation` child AND a SQL keyword (case-insensitive).
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const SQL_KEYWORDS = /\b(SELECT|INSERT|UPDATE|DELETE|WHERE|FROM)\b/i;
const DB_METHODS = new Set(['execute', 'query', 'where', 'find_by_sql', 'exec_query']);
const SQL_VAR_NAMES = new Set(['sql', 'query']);

/** True if the string subtree has an `interpolation` child anywhere. */
function hasInterpolation(node: TSNode): boolean {
  if (node.type === 'interpolation') return true;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && hasInterpolation(child)) return true;
  }
  return false;
}

/** A `string` node that interpolates and mentions a SQL keyword. */
function isTaintedSqlString(node: TSNode): boolean {
  return node.type === 'string' && hasInterpolation(node) && SQL_KEYWORDS.test(node.text);
}

export const sqlInjectionRubyRule: Rule = {
  id: 'IED-S020',
  name: 'sql-injection',
  category: 'security',
  severity: Severity.Error,
  languages: ['ruby'],
  description: 'SQL query built with string interpolation of a variable.',
  docs: [
    '# sql-injection (IED-S020)',
    '',
    'Interpolating values into a SQL string lets an attacker alter the query.',
    'Use parameterized queries / bound parameters instead.',
    '',
    '```ruby',
    'db.execute("SELECT * FROM users WHERE id = #{id}") # flagged',
    'db.execute("SELECT * FROM users WHERE id = ?", [id]) # ok',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const seen = new Set<string>();

    const report = (node: TSNode): void => {
      const row = node.startPosition.row;
      const key = `${row}:${node.startPosition.column}`;
      if (seen.has(key)) return;
      if (ctx.isSuppressed(row, 'IED-S020')) return;
      seen.add(key);
      ctx.report({
        message: 'Possible SQL injection — use parameterized queries instead of interpolation.',
        severity: Severity.Error,
        range: nodeRange(node),
        data: {}
      });
    };

    const walk = (node: TSNode): void => {
      // DB method call: db.execute(<tainted>), User.where(<tainted>), etc.
      if (node.type === 'call') {
        const method = node.childForFieldName('method');
        if (method && DB_METHODS.has(method.text)) {
          const args = node.childForFieldName('arguments');
          if (args) {
            for (let i = 0; i < args.namedChildCount; i++) {
              const arg = args.namedChild(i);
              if (arg && isTaintedSqlString(arg)) report(arg);
            }
          }
        }
      }

      // Assignment to a sql/query variable: sql = <tainted>
      if (node.type === 'assignment') {
        const left = node.childForFieldName('left');
        const right = node.childForFieldName('right');
        if (
          left?.type === 'identifier' &&
          SQL_VAR_NAMES.has(left.text.toLowerCase()) &&
          right &&
          isTaintedSqlString(right)
        ) {
          report(right);
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
