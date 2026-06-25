/**
 * IED-S012 — fstring-injection
 *
 * Flags f-strings (strings containing `interpolation`) that flow into a SQL
 * execution call (`execute`, `executemany`, `raw`, `query`) or are assigned to
 * a variable whose name looks like SQL (`sql`, `query`). Interpolating values
 * into SQL text is a classic injection vector; use parameterized queries.
 *
 * Conservative: only fires when the f-string interpolates a non-literal value
 * AND lands in one of those two recognizable sinks.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const SQL_METHODS = /^(execute|executemany|raw|query)$/;
const SQL_VAR = /sql|query/i;

/** True when the string node is an f-string with at least one interpolation. */
function isFString(node: TSNode): boolean {
  if (node.type !== 'string') return false;
  return node.namedChildren.some((c) => c.type === 'interpolation');
}

/** Resolve the callee's final method/function name for a `call` node. */
function calleeName(call: TSNode): string | null {
  const fn = call.childForFieldName('function');
  if (!fn) return null;
  if (fn.type === 'attribute') {
    return fn.childForFieldName('attribute')?.text ?? null;
  }
  if (fn.type === 'identifier') return fn.text;
  return null;
}

export const fstringInjectionRule: Rule = {
  id: 'IED-S012',
  name: 'fstring-injection',
  category: 'security',
  severity: Severity.Error,
  languages: ['python'],
  description: 'Interpolated f-string used as SQL text (possible SQL injection).',
  docs: [
    '# fstring-injection (IED-S012)',
    '',
    'Building SQL by interpolating values into an f-string allows SQL injection.',
    '',
    '```py',
    'cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")  # flagged',
    '```',
    '',
    'Use parameterized queries: `cursor.execute("... WHERE id = %s", (user_id,))`.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const report = (str: TSNode, where: string): void => {
      if (ctx.isSuppressed(str.startPosition.row, 'IED-S012')) return;
      ctx.report({
        message: `Interpolated f-string used as ${where}; this is a SQL-injection risk. Use parameterized queries.`,
        severity: Severity.Error,
        range: nodeRange(str),
        data: { sink: where }
      });
    };

    const walk = (node: TSNode): void => {
      // Sink 1: passed as an argument to a SQL execution call.
      if (node.type === 'call' && SQL_METHODS.test(calleeName(node) ?? '')) {
        const args = node.childForFieldName('arguments');
        if (args) {
          for (let i = 0; i < args.namedChildCount; i++) {
            const arg = args.namedChild(i);
            if (arg && isFString(arg)) report(arg, 'a query argument');
          }
        }
      }
      // Sink 2: assigned to a SQL-named variable.
      if (node.type === 'assignment') {
        const left = node.childForFieldName('left');
        const right = node.childForFieldName('right');
        if (left && right && left.type === 'identifier' && SQL_VAR.test(left.text) && isFString(right)) {
          report(right, `the SQL variable \`${left.text}\``);
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const c = node.child(i);
        if (c) walk(c);
      }
    };
    walk(ctx.tree.rootNode);
  }
};
