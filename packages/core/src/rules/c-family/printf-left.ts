/**
 * IED-Q016 — printf-left (C / C++)
 *
 * Flags debug-output statements left in shipping code: bare `printf(...)`,
 * `puts(...)`, `fprintf(stderr, ...)`, and `std::cout << ...`. These are almost
 * always leftover debugging that should be removed or routed through a real
 * logging facility. Relaxed inside test files.
 *
 * (IED-Q013 is already taken, hence Q016.)
 *
 * Reads calls (and, in C++, binary expressions) from the shared node index in
 * document order.
 */

import {
  Severity,
  nodeRange,
  type Language,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const DEBUG_CALLS = new Set(['printf', 'puts']);

/**
 * Indexed node types. A `std::cout` chain needs a `qualified_identifier`, which
 * only the C++ grammar has, so in C only calls can match.
 */
function indexedTypes(language: Language): string[] {
  return language === 'cpp' ? ['call_expression', 'binary_expression'] : ['call_expression'];
}

function calleeName(call: TSNode): string | null {
  const fn = call.childForFieldName('function');
  if (!fn) return null;
  if (fn.type === 'identifier') return fn.text;
  if (fn.type === 'qualified_identifier') {
    return fn.childForFieldName('name')?.text ?? null;
  }
  return null;
}

/** First argument identifier text, e.g. the `stderr` in `fprintf(stderr, ...)`. */
function firstArgName(call: TSNode): string | null {
  const arg = call.childForFieldName('arguments')?.namedChild(0);
  return arg?.type === 'identifier' ? arg.text : null;
}

/** True if a binary `<<` chain has `std::cout` / `std::cerr` at its far left. */
function isCoutStream(node: TSNode): boolean {
  let cur: TSNode | null = node;
  while (cur && cur.type === 'binary_expression' && cur.childForFieldName('operator')?.text === '<<') {
    cur = cur.childForFieldName('left');
  }
  if (cur?.type === 'qualified_identifier') {
    const scope = cur.childForFieldName('scope')?.text;
    const name = cur.childForFieldName('name')?.text;
    return scope === 'std' && (name === 'cout' || name === 'cerr');
  }
  return false;
}

export const printfLeftRule: Rule = {
  id: 'IED-Q016',
  name: 'printf-left',
  category: 'quality',
  severity: Severity.Info,
  languages: ['c', 'cpp'],
  description: 'Debug printf/puts/cout left in shipping code.',
  docs: [
    '# printf-left (IED-Q016)',
    '',
    'Bare `printf`, `puts`, `fprintf(stderr, …)` and `std::cout << …` are usually',
    'leftover debug output. Remove them or route through a logging facility with',
    'levels. Relaxed inside test files.',
    '',
    '```c',
    'printf("here %d\\n", x); // flagged',
    '```'
  ].join('\n'),

  nodeTypes: indexedTypes,

  run(ctx: RuleContext): void {
    if (ctx.isTestFile) return;

    const report = (node: TSNode, what: string): void => {
      if (ctx.isSuppressed(node.startPosition.row, 'IED-Q016')) return;
      ctx.report({
        message: `remove debug ${what} before shipping.`,
        severity: Severity.Info,
        range: nodeRange(node),
        data: { kind: what }
      });
    };

    for (const node of ctx.nodesOfType(indexedTypes(ctx.language))) {
      if (node.type === 'call_expression') {
        const name = calleeName(node);
        if (name && DEBUG_CALLS.has(name)) {
          report(node, name);
        } else if (name === 'fprintf' && firstArgName(node) === 'stderr') {
          report(node, 'fprintf');
        }
      } else if (isCoutStream(node)) {
        // Only report the outermost `<<` chain, not each nested binary_expression.
        const parent = node.parent;
        const parentIsChain =
          parent?.type === 'binary_expression' &&
          parent.childForFieldName('operator')?.text === '<<';
        if (!parentIsChain) report(node, 'std::cout');
      }
    }
  }
};
