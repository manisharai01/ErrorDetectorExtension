/**
 * IED-S019 — sql-string-concat (C#)
 *
 * Building a SQL command by concatenating or interpolating a variable into a
 * query string is the classic SQL-injection vector. This rule flags two
 * shapes, conservatively (a SQL keyword must be present AND a non-literal must
 * be spliced in):
 *
 *   1. `binary_expression` with `operator: +` where one side is a string
 *      containing a SQL keyword and the expression involves an identifier
 *      (non-literal) operand.
 *   2. `interpolated_string_expression` containing a SQL keyword and at least
 *      one `interpolation` (e.g. `$"SELECT ... {userInput}"`).
 *
 * Use parameterized queries / command parameters instead.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const SQL_KEYWORD = /\b(SELECT|INSERT|UPDATE|DELETE|WHERE|FROM)\b/i;

/** True if the node is any C# string form. */
function isStringNode(node: TSNode | null): boolean {
  return (
    !!node &&
    (node.type === 'string_literal' ||
      node.type === 'verbatim_string_literal' ||
      node.type === 'interpolated_string_expression')
  );
}

/** True if the node is a plain literal (string/number) with no variable. */
function isLiteralNode(node: TSNode | null): boolean {
  if (!node) return false;
  return (
    node.type === 'string_literal' ||
    node.type === 'verbatim_string_literal' ||
    node.type === 'integer_literal' ||
    node.type === 'real_literal'
  );
}

export const sqlStringConcatRule: Rule = {
  id: 'IED-S019',
  name: 'sql-string-concat',
  category: 'security',
  severity: Severity.Error,
  languages: ['csharp'],
  description: 'Flags SQL built by concatenating or interpolating a variable into a string.',
  docs: [
    '# sql-string-concat (IED-S019)',
    '',
    'Splicing a variable into a SQL string opens the door to SQL injection.',
    '',
    '```csharp',
    'var q = "SELECT * FROM users WHERE id = " + userId;   // flagged',
    'var q2 = $"SELECT * FROM users WHERE id = {userId}";  // flagged',
    '```',
    '',
    'Use parameterized queries (`SqlCommand.Parameters`, Dapper parameters,',
    'or an ORM) so user input is never concatenated into the SQL text.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const report = (node: TSNode): void => {
      if (ctx.isSuppressed(node.startPosition.row, 'IED-S019')) return;
      ctx.report({
        message: 'SQL query built from a variable; use parameterized queries to avoid SQL injection.',
        severity: Severity.Error,
        range: nodeRange(node)
      });
    };

    const walk = (node: TSNode): void => {
      // Shape 2: interpolated string with a SQL keyword and an interpolation.
      if (node.type === 'interpolated_string_expression') {
        const hasSql = SQL_KEYWORD.test(node.text);
        let hasInterp = false;
        for (let i = 0; i < node.childCount; i++) {
          if (node.child(i)?.type === 'interpolation') {
            hasInterp = true;
            break;
          }
        }
        if (hasSql && hasInterp) report(node);
      }

      // Shape 1: `+` concatenation where a SQL string meets a non-literal.
      if (node.type === 'binary_expression') {
        const op = node.childForFieldName('operator');
        if (op && op.text === '+') {
          const left = node.childForFieldName('left');
          const right = node.childForFieldName('right');
          const stringSide = [left, right].find(
            (s) => isStringNode(s) && SQL_KEYWORD.test(s!.text)
          );
          // Require a non-literal operand somewhere in the expression.
          const hasVariable = [left, right].some((s) => s && !isLiteralNode(s));
          if (stringSide && hasVariable) report(node);
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
