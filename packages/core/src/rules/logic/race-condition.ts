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
 * body. Walk-based and two-pass per function: collect awaited writes, then
 * report identifiers written twice.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

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
  if (!FUNCTION_TYPES.has(node.type)) return false;
  // The `async` keyword appears as an anonymous child token before the params.
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c && c.type === 'async') return true;
  }
  // Some grammars surface it via text on the leading tokens; fall back to a
  // cheap source check on the node's first line as a safety net.
  return /\basync\b/.test(node.text.slice(0, node.text.indexOf('(') + 1 || 0));
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

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (isAsyncFunction(node)) {
        checkAsyncFunction(ctx, node);
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child);
      }
    };
    walk(ctx.tree.rootNode);
  }
};

function checkAsyncFunction(ctx: RuleContext, fn: TSNode): void {
  // name -> list of assignment nodes that involve an await, in source order.
  const awaitedWrites = new Map<string, TSNode[]>();

  const collect = (node: TSNode, scopeRoot: TSNode): void => {
    // Don't descend into nested functions; they get their own analysis pass.
    if (node !== scopeRoot && FUNCTION_TYPES.has(node.type)) return;

    if (ASSIGN_TYPES.has(node.type)) {
      const right = node.childForFieldName('right');
      if (right && containsAwait(right)) {
        const name = assignTargetName(node);
        if (name) {
          const list = awaitedWrites.get(name);
          if (list) list.push(node);
          else awaitedWrites.set(name, [node]);
        }
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) collect(child, scopeRoot);
    }
  };

  collect(fn, fn);

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
