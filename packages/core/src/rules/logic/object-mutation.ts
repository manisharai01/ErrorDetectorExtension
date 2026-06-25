/**
 * IED-L004 — object-mutation
 *
 * Flags mutation of a function's incoming arguments: an assignment whose
 * left-hand side is a member/subscript access rooted at a function parameter
 * (e.g. `opts.x = 1` or `arr[0] = 1` where `opts`/`arr` is a parameter).
 * Mutating arguments is a side effect that surprises callers.
 *
 * Two-pass, walk-based: for each function-like node collect its
 * `formal_parameters` identifiers, then within that function's body flag
 * `assignment_expression` / `augmented_assignment_expression` whose left side
 * is a member/subscript access rooted at one of those parameters.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

/** Node types that own a `formal_parameters` and a body we should scope into. */
const FUNCTION_TYPES = new Set([
  'function_declaration',
  'function_expression',
  'arrow_function',
  'method_definition',
  'generator_function',
  'generator_function_declaration'
]);

const ASSIGN_TYPES = new Set(['assignment_expression', 'augmented_assignment_expression']);

/**
 * Collect the parameter identifier names declared directly on a function node.
 * Handles `formal_parameters` containing `identifier`, `required_parameter`,
 * and `optional_parameter` (TS), and a bare-identifier arrow param.
 */
function collectParamNames(fn: TSNode): Set<string> {
  const names = new Set<string>();
  const params = fn.childForFieldName('parameters');

  const addPattern = (node: TSNode | null): void => {
    if (!node) return;
    if (node.type === 'identifier') {
      names.add(node.text);
      return;
    }
    // required_parameter / optional_parameter wrap a `pattern` (often identifier).
    const pat = node.childForFieldName('pattern');
    if (pat) {
      if (pat.type === 'identifier') names.add(pat.text);
      return;
    }
    // Fallback: a direct identifier child (covers some grammar shapes).
    for (let i = 0; i < node.namedChildCount; i++) {
      const c = node.namedChild(i);
      if (c && c.type === 'identifier') {
        names.add(c.text);
        break;
      }
    }
  };

  if (params) {
    for (let i = 0; i < params.namedChildCount; i++) {
      addPattern(params.namedChild(i));
    }
  } else {
    // Arrow with a single bare-identifier parameter: `p => p.x = 1`.
    const single = fn.childForFieldName('parameter');
    if (single && single.type === 'identifier') names.add(single.text);
  }
  return names;
}

/**
 * The root identifier of a member/subscript chain, or null if the chain isn't
 * rooted at a plain identifier. `a.b.c` -> "a"; `a[0].b` -> "a".
 */
function rootIdentifier(expr: TSNode): string | null {
  let cur: TSNode | null = expr;
  while (cur && (cur.type === 'member_expression' || cur.type === 'subscript_expression')) {
    cur = cur.childForFieldName('object');
  }
  return cur && cur.type === 'identifier' ? cur.text : null;
}

export const objectMutationRule: Rule = {
  id: 'IED-L004',
  name: 'object-mutation',
  category: 'logic',
  severity: Severity.Warning,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue'],
  description: 'Mutation of a function argument via member or index assignment.',
  docs: [
    '# object-mutation (IED-L004)',
    '',
    'Assigning to a property or index of an incoming function parameter mutates',
    'the caller’s object, which is a surprising side effect.',
    '',
    '```js',
    'function f(opts) { opts.ready = true; }   // flagged',
    'function g(arr)  { arr[0] = 1; }           // flagged',
    '```',
    '',
    '```js',
    'function f(opts) { const copy = { ...opts, ready: true }; return copy; } // ok',
    'function h() { const local = {}; local.x = 1; }                          // ok',
    '```',
    '',
    'Suppress with `// ied-disable-next-line IED-L004`.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    // Walk every function; within its subtree, the params it declares are the
    // "argument" identifiers we guard. Nested functions are visited on their
    // own, so each function's params are checked against its own assignments.
    const walkFunctions = (node: TSNode): void => {
      if (FUNCTION_TYPES.has(node.type)) {
        const params = collectParamNames(node);
        if (params.size > 0) {
          checkAssignments(ctx, node, params, node);
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walkFunctions(child);
      }
    };
    walkFunctions(ctx.tree.rootNode);
  }
};

/**
 * Scan `node`'s subtree for assignments to a param-rooted member/subscript.
 * Stops descending into nested functions so their (shadowing) params aren't
 * checked against this function's param set.
 */
function checkAssignments(
  ctx: RuleContext,
  node: TSNode,
  params: Set<string>,
  scopeRoot: TSNode
): void {
  // Don't re-enter a nested function's body (other than the scope root itself).
  if (node !== scopeRoot && FUNCTION_TYPES.has(node.type)) return;

  if (ASSIGN_TYPES.has(node.type)) {
    const left = node.childForFieldName('left');
    if (
      left &&
      (left.type === 'member_expression' || left.type === 'subscript_expression')
    ) {
      const root = rootIdentifier(left);
      if (root && params.has(root)) {
        const row = node.startPosition.row;
        if (!ctx.isSuppressed(row, 'IED-L004')) {
          ctx.report({
            message: `Mutation of function argument "${root}".`,
            severity: Severity.Warning,
            range: nodeRange(node),
            data: { param: root }
          });
        }
      }
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) checkAssignments(ctx, child, params, scopeRoot);
  }
}
