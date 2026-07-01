/**
 * IED-S016 — format-string (C / C++)
 *
 * Flags printf-family calls whose format-string argument is not a string
 * literal. Passing a variable where a format string is expected
 * (`printf(userInput)`) lets an attacker embed `%n`/`%s` conversions and read
 * or corrupt memory — the classic format-string vulnerability.
 *
 * The format argument's position depends on the function:
 *   printf(fmt, ...)          -> arg 0
 *   fprintf(stream, fmt, ...) -> arg 1
 *   sprintf(buf, fmt, ...)    -> arg 1
 *   snprintf(buf, n, fmt, ..) -> arg 2
 *   syslog(priority, fmt, ..) -> arg 1
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

/** Function name -> zero-based index of its format-string argument. */
const FORMAT_ARG_INDEX: Record<string, number> = {
  printf: 0,
  fprintf: 1,
  sprintf: 1,
  snprintf: 2,
  syslog: 1
};

function calleeName(call: TSNode): string | null {
  const fn = call.childForFieldName('function');
  if (!fn) return null;
  if (fn.type === 'identifier') return fn.text;
  if (fn.type === 'qualified_identifier') {
    return fn.childForFieldName('name')?.text ?? null;
  }
  return null;
}

/** A literal format string, possibly a run of adjacent literals or a macro-wrapped one. */
function isLiteralFormat(arg: TSNode): boolean {
  if (arg.type === 'string_literal' || arg.type === 'concatenated_string') return true;
  // `"a" "b"` adjacency or an _Generic/macro that produced a literal — treat a
  // node whose only named children are string literals as literal too.
  if (arg.type === 'char_literal') return true;
  return false;
}

export const formatStringRule: Rule = {
  id: 'IED-S016',
  name: 'format-string',
  category: 'security',
  severity: Severity.Error,
  languages: ['c', 'cpp'],
  description: 'printf-family call whose format string is not a string literal.',
  docs: [
    '# format-string (IED-S016)',
    '',
    'When the format argument of a `printf`-family function is a variable rather',
    'than a literal, an attacker who controls that string can use `%n`/`%s` to',
    'read or write arbitrary memory.',
    '',
    '```c',
    'printf(userInput);        // flagged',
    'printf("%s", userInput);  // safe',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const matches = ctx.query('(call_expression) @call');

    for (const m of matches) {
      const call = m.captures.find((c) => c.name === 'call')?.node;
      if (!call) continue;

      const name = calleeName(call);
      if (!name || !(name in FORMAT_ARG_INDEX)) continue;

      const args = call.childForFieldName('arguments');
      if (!args) continue;

      const fmtIndex = FORMAT_ARG_INDEX[name];
      const fmtArg = args.namedChild(fmtIndex);
      // No argument at the expected position -> not the call shape we model.
      if (!fmtArg) continue;
      if (isLiteralFormat(fmtArg)) continue;

      if (ctx.isSuppressed(call.startPosition.row, 'IED-S016')) continue;
      ctx.report({
        message: `format string is not a literal — format string vulnerability (\`${name}\`).`,
        severity: Severity.Error,
        range: nodeRange(call),
        data: { callee: name, formatArgIndex: fmtIndex }
      });
    }
  }
};
