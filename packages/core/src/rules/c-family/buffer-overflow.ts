/**
 * IED-S015 — buffer-overflow (C / C++)
 *
 * Two conservative shapes:
 *   1. Calls to the classic unbounded-copy functions `gets`, `strcpy`,
 *      `strcat`, `sprintf` — these have no destination-size bound and are the
 *      textbook source of stack/heap overflows.
 *   2. A constant out-of-bounds index: `arr[N]` where `N` is a numeric literal
 *      `>=` the literal size the array `arr` was declared with in the same
 *      function (tracked from `array_declarator` size nodes).
 *
 * The function-call form is reliable; the static-index form only fires when
 * both the declared size and the index are integer literals, so it is very low
 * false-positive.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const UNBOUNDED_COPY = new Set(['gets', 'strcpy', 'strcat', 'sprintf']);

/** Parse an integer literal node like `8`, `0x10`, `010` to a number, else null. */
function literalToInt(node: TSNode | null | undefined): number | null {
  if (!node || node.type !== 'number_literal') return null;
  const text = node.text.replace(/[uUlL]+$/, '');
  const value = Number(text);
  return Number.isInteger(value) ? value : null;
}

/** Resolve the called function's plain name for a call_expression. */
function calleeName(call: TSNode): string | null {
  const fn = call.childForFieldName('function');
  if (!fn) return null;
  if (fn.type === 'identifier') return fn.text;
  // `std::sprintf` style.
  if (fn.type === 'qualified_identifier') {
    return fn.childForFieldName('name')?.text ?? null;
  }
  return null;
}

export const bufferOverflowRule: Rule = {
  id: 'IED-S015',
  name: 'buffer-overflow',
  category: 'security',
  severity: Severity.Warning,
  languages: ['c', 'cpp'],
  description: 'Unbounded copy function or constant out-of-bounds array index.',
  docs: [
    '# buffer-overflow (IED-S015)',
    '',
    'Flags the unbounded copy functions `gets`, `strcpy`, `strcat`, `sprintf`,',
    'which write without a destination-size bound, and constant indexes that',
    'exceed an array declared with a literal size.',
    '',
    '```c',
    'char buf[8];',
    'strcpy(buf, src); // flagged: unbounded copy',
    'buf[10] = 0;      // flagged: index 10 >= size 8',
    '```',
    '',
    'Prefer `strncpy`/`strncat`/`snprintf` and `fgets` over `gets`.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode, sizes: Map<string, number>): void => {
      // A function body gets its own size scope.
      const ownScope = node.type === 'function_definition';
      const scope = ownScope ? new Map<string, number>() : sizes;

      // Track `T arr[N];` declarations with literal sizes.
      if (node.type === 'array_declarator') {
        const decl = node.childForFieldName('declarator');
        const size = literalToInt(node.childForFieldName('size'));
        if (decl?.type === 'identifier' && size !== null) {
          scope.set(decl.text, size);
        }
      }

      // Shape 1: unbounded-copy calls.
      if (node.type === 'call_expression') {
        const name = calleeName(node);
        if (name && UNBOUNDED_COPY.has(name)) {
          if (!ctx.isSuppressed(node.startPosition.row, 'IED-S015')) {
            ctx.report({
              message: `possible buffer overflow — \`${name}\` performs an unbounded copy.`,
              severity: Severity.Warning,
              range: nodeRange(node),
              data: { callee: name, kind: 'unbounded-copy' }
            });
          }
        }
      }

      // Shape 2: constant out-of-bounds index.
      if (node.type === 'subscript_expression') {
        const arg = node.childForFieldName('argument');
        const idx = literalToInt(node.childForFieldName('index'));
        if (arg?.type === 'identifier' && idx !== null) {
          const declared = scope.get(arg.text);
          if (declared !== undefined && idx >= declared) {
            if (!ctx.isSuppressed(node.startPosition.row, 'IED-S015')) {
              ctx.report({
                message: `possible buffer overflow — index ${idx} is outside \`${arg.text}[${declared}]\`.`,
                severity: Severity.Warning,
                range: nodeRange(node),
                data: { array: arg.text, index: idx, size: declared, kind: 'index' }
              });
            }
          }
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child, scope);
      }
    };

    walk(ctx.tree.rootNode, new Map());
  }
};
