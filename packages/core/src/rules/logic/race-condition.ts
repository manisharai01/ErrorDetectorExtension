/**
 * IED-C001 — race-condition
 *
 * Heuristic detector for a classic TOCTOU / shared-state race in async code:
 * inside an `async` function, the same variable is assigned in two or more
 * statements that each involve an `await` (i.e. `x = await ...` twice, or two
 * assignments each sequenced around an await). Interleaving suspensions make
 * such writes ordering-dependent.
 *
 * Conservative: we only flag when the SAME left-hand identifier name is the
 * target of two or more await-bearing assignments within one async function
 * body. One pass over the indexed functions + assignments collects each async
 * function's awaited writes, then identifiers written twice are reported.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';
import { EnclosingStack, spanOf } from '../util';

const FUNCTION_TYPES = new Set([
  'function_declaration',
  'function_expression',
  'arrow_function',
  'method_definition',
  'generator_function',
  'generator_function_declaration'
]);

const ASSIGN_TYPES = new Set(['assignment_expression', 'augmented_assignment_expression']);

/** True if this function-like node carries the `async` keyword. */
function isAsyncFunction(node: TSNode): boolean {
  // The `async` keyword appears as an anonymous child token before the params.
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c && c.type === 'async') return true;
  }
  return false;
}

/** Does this subtree contain an `await_expression` (without crossing into a
 * nested function)? */
function containsAwait(node: TSNode): boolean {
  if (node.type === 'await_expression') return true;
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (!c) continue;
    if (FUNCTION_TYPES.has(c.type)) continue;
    if (containsAwait(c)) return true;
  }
  return false;
}

/** The LHS identifier name of an assignment, or null when it isn't a plain
 * identifier or simple member chain we can name. */
function assignTargetName(assign: TSNode): string | null {
  const left = assign.childForFieldName('left');
  if (!left) return null;
  if (left.type === 'identifier') return left.text;
  if (left.type === 'member_expression' || left.type === 'subscript_expression') {
    // Use the full member text so `this.x` / `state.count` are tracked distinctly.
    return left.text;
  }
  return null;
}

export const raceConditionRule: Rule = {
  id: 'IED-C001',
  name: 'race-condition',
  category: 'concurrency',
  severity: Severity.Warning,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue'],
  description: 'Same variable written in multiple awaited assignments in one async function.',
  docs: [
    '# race-condition (IED-C001)',
    '',
    'Inside an `async` function, assigning the same variable in two or more',
    'await-bearing statements is ordering-dependent: another task can run during',
    'the suspension and the second write may clobber the first (a TOCTOU smell).',
    '',
    '```js',
    'async function f() {',
    '  shared = await load(1);   // flagged',
    '  shared = await load(2);   // (same target written across awaits)',
    '}',
    '```',
    '',
    '```js',
    'async function g() {',
    '  const a = await load(1);  // ok: distinct const targets',
    '  const b = await load(2);',
    '}',
    '```',
    '',
    'Heuristic and conservative. Suppress with `// ied-disable-next-line IED-C001`.'
  ].join('\n'),

  nodeTypes: () => [...FUNCTION_TYPES, ...ASSIGN_TYPES],

  run(ctx: RuleContext): void {
    // Each assignment belongs to its innermost enclosing function; only async
    // functions collect awaited writes. Reported per function, in function order.
    const asyncFunctions: Array<Map<string, TSNode[]>> = [];
    const scopes = new EnclosingStack<Map<string, TSNode[]> | null>();

    for (const node of ctx.nodesOfType([...FUNCTION_TYPES, ...ASSIGN_TYPES])) {
      scopes.at(spanOf(node));
      if (FUNCTION_TYPES.has(node.type)) {
        // name -> assignment nodes that involve an await, in source order.
        const writes = isAsyncFunction(node) ? new Map<string, TSNode[]>() : null;
        if (writes) asyncFunctions.push(writes);
        scopes.push(spanOf(node), writes);
        continue;
      }
      const writes = scopes.innermost();
      if (!writes) continue;
      const right = node.childForFieldName('right');
      if (!right || !containsAwait(right)) continue;
      const name = assignTargetName(node);
      if (!name) continue;
      const list = writes.get(name);
      if (list) list.push(node);
      else writes.set(name, [node]);
    }

    for (const writes of asyncFunctions) reportRaces(ctx, writes);
  }
};

function reportRaces(ctx: RuleContext, awaitedWrites: Map<string, TSNode[]>): void {
  for (const [name, list] of awaitedWrites) {
    if (list.length >= 2) {
      const first = list[0];
      const row = first.startPosition.row;
      if (ctx.isSuppressed(row, 'IED-C001')) continue;
      ctx.report({
        message: `Variable "${name}" is assigned in multiple awaited expressions; possible race condition.`,
        severity: Severity.Warning,
        range: nodeRange(first),
        data: { variable: name, writes: list.length }
      });
    }
  }
}
