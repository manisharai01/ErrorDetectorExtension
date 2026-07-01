/**
 * IED-L017 — integer-overflow (C / C++)
 *
 * Conservative heuristic for the classic allocation-size overflow:
 * `malloc(a * b)` / `calloc`-style size computations where the multiplication
 * has at least one non-constant (identifier) operand. If `a * b` overflows
 * `size_t`, the allocation is far smaller than intended and the subsequent
 * writes overflow the heap.
 *
 * We only flag a `*` (or `<<`) binary expression that appears inside the size
 * argument of `malloc`/`calloc`/`realloc`/`alloca`, with at least one
 * identifier operand — pure literal computations are constant-folded and safe.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const ALLOCATORS = new Set(['malloc', 'calloc', 'realloc', 'alloca']);

function calleeName(call: TSNode): string | null {
  const fn = call.childForFieldName('function');
  if (!fn) return null;
  if (fn.type === 'identifier') return fn.text;
  if (fn.type === 'qualified_identifier') {
    return fn.childForFieldName('name')?.text ?? null;
  }
  return null;
}

/** True if the operand is a non-constant integer-ish expression (identifier / call / field). */
function isNonConstant(node: TSNode | null): boolean {
  if (!node) return false;
  return (
    node.type === 'identifier' ||
    node.type === 'field_expression' ||
    node.type === 'call_expression' ||
    node.type === 'subscript_expression'
  );
}

/** Find a risky `a * b` / `a << b` binary_expression inside `node`. */
function riskyMultiplyIn(node: TSNode): TSNode | null {
  const stack: TSNode[] = [node];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur.type === 'binary_expression') {
      const op = cur.childForFieldName('operator')?.text;
      if (op === '*' || op === '<<') {
        const left = cur.childForFieldName('left');
        const right = cur.childForFieldName('right');
        // Flag when at least one side is non-constant (overflow is data-dependent).
        if (isNonConstant(left) || isNonConstant(right)) return cur;
      }
    }
    for (let i = 0; i < cur.namedChildCount; i++) {
      const child = cur.namedChild(i);
      if (child) stack.push(child);
    }
  }
  return null;
}

export const integerOverflowRule: Rule = {
  id: 'IED-L017',
  name: 'integer-overflow',
  category: 'logic',
  severity: Severity.Info,
  languages: ['c', 'cpp'],
  description: 'Multiplication in an allocation size that can overflow size_t.',
  docs: [
    '# integer-overflow (IED-L017)',
    '',
    'A size computed as `count * width` can wrap around `size_t`, making the',
    'allocation far smaller than intended and the following writes overflow the',
    'heap. Use a checked-multiply helper or `calloc(count, width)` which checks',
    'for overflow.',
    '',
    '```c',
    'p = malloc(n * sizeof(int)); // flagged when n is not constant',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const matches = ctx.query('(call_expression) @call');

    for (const m of matches) {
      const call = m.captures.find((c) => c.name === 'call')?.node;
      if (!call) continue;

      const name = calleeName(call);
      if (!name || !ALLOCATORS.has(name)) continue;

      const args = call.childForFieldName('arguments');
      if (!args) continue;

      // Scan every size argument for a risky multiply.
      let risky: TSNode | null = null;
      for (let i = 0; i < args.namedChildCount; i++) {
        const arg = args.namedChild(i);
        if (arg) risky = riskyMultiplyIn(arg);
        if (risky) break;
      }
      if (!risky) continue;

      if (ctx.isSuppressed(call.startPosition.row, 'IED-L017')) continue;
      ctx.report({
        message: `possible integer overflow in size computation passed to \`${name}\`.`,
        severity: Severity.Info,
        range: nodeRange(risky),
        data: { callee: name }
      });
    }
  }
};
