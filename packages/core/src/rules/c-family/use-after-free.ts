/**
 * IED-R010 — use-after-free (C / C++)
 *
 * Conservative single-block heuristic. Within one `compound_statement`, find a
 * `free(p)` call or a `delete p` expression, then look at the statements that
 * follow it in the same block. If the same pointer identifier `p` is referenced
 * again before being reassigned (`p = ...`) or re-freed, that is a use after
 * free.
 *
 * Staying inside one block and requiring no intervening reassignment keeps the
 * false-positive rate low (loops, gotos and aliasing are deliberately ignored).
 *
 * The blocks, calls and delete expressions come from the shared node index in
 * document order; a statement's first call / delete is found by binary search
 * over those lists rather than by re-traversing the statement.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';
import { encloses, spanOf, type Span } from '../util';

/** `delete_expression` only exists in C++; in C the list is simply empty. */
const NODE_TYPES = ['compound_statement', 'call_expression', 'delete_expression'];

function calleeName(call: TSNode): string | null {
  const fn = call.childForFieldName('function');
  if (!fn) return null;
  if (fn.type === 'identifier') return fn.text;
  return null;
}

/**
 * The first node of document-ordered `nodes` inside `span` — what a pre-order
 * search of that subtree finds first (the subtree root itself if it is one).
 * Document order is also start order, so binary-search the first node starting
 * at or after the span; the subtree holds a match only if that one is inside.
 */
function firstWithin(nodes: readonly TSNode[], span: Span): TSNode | undefined {
  let lo = 0;
  let hi = nodes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (nodes[mid].startIndex < span.start) lo = mid + 1;
    else hi = mid;
  }
  const first = nodes[lo];
  return first && encloses(span, spanOf(first)) ? first : undefined;
}

/** The pointer identifier freed by `free(x)` / `delete x`, or null. */
function freedTarget(
  stmt: TSNode,
  calls: readonly TSNode[],
  deletes: readonly TSNode[]
): { name: string; node: TSNode } | null {
  const span = spanOf(stmt);
  // free(x);
  const call = firstWithin(calls, span);
  if (call && calleeName(call) === 'free') {
    const arg = call.childForFieldName('arguments')?.namedChild(0);
    if (arg?.type === 'identifier') return { name: arg.text, node: call };
  }
  // delete x;  /  delete[] x;
  const del = firstWithin(deletes, span);
  if (del) {
    const target = del.namedChildren.find((c) => c.type === 'identifier');
    if (target) return { name: target.text, node: del };
  }
  return null;
}

/** True if `stmt` reassigns identifier `name` at the top (`name = ...`). */
function reassigns(stmt: TSNode, name: string): boolean {
  for (const assign of stmt.descendantsOfType('assignment_expression')) {
    const left = assign.childForFieldName('left');
    if (left?.type === 'identifier' && left.text === name) return true;
  }
  // A re-declaration `T* name = ...` also resets it.
  for (const initd of stmt.descendantsOfType('init_declarator')) {
    let decl = initd.childForFieldName('declarator');
    while (decl && decl.type === 'pointer_declarator') {
      decl = decl.childForFieldName('declarator');
    }
    if (decl?.type === 'identifier' && decl.text === name) return true;
  }
  return false;
}

/** True if `stmt` references identifier `name` (read or deref) anywhere. */
function references(stmt: TSNode, name: string): boolean {
  for (const id of stmt.descendantsOfType('identifier')) {
    if (id.text === name) return true;
  }
  return false;
}

export const useAfterFreeRule: Rule = {
  id: 'IED-R010',
  name: 'use-after-free',
  category: 'resource',
  severity: Severity.Warning,
  languages: ['c', 'cpp'],
  description: 'Pointer used after free()/delete without an intervening reassignment.',
  docs: [
    '# use-after-free (IED-R010)',
    '',
    'Reading or dereferencing a pointer after it has been `free`d (or `delete`d)',
    'is undefined behaviour and a common exploitation primitive. Set the pointer',
    'to `NULL`/`nullptr` immediately after freeing, or restructure so it is not',
    'touched again.',
    '',
    '```c',
    'free(p);',
    '*p = 0; // flagged: use after free',
    '```'
  ].join('\n'),

  nodeTypes: () => NODE_TYPES,

  run(ctx: RuleContext): void {
    const calls = ctx.nodesOfType('call_expression');
    const deletes = ctx.nodesOfType('delete_expression');

    // Each block is scanned on its own, outer blocks before the blocks nested
    // in them (document order).
    for (const block of ctx.nodesOfType('compound_statement')) {
      const stmts = block.namedChildren;
      for (let i = 0; i < stmts.length; i++) {
        const freed = freedTarget(stmts[i], calls, deletes);
        if (!freed) continue;

        // Scan subsequent statements in this block.
        for (let j = i + 1; j < stmts.length; j++) {
          const later = stmts[j];
          if (reassigns(later, freed.name)) break; // pointer is valid again
          if (references(later, freed.name)) {
            if (!ctx.isSuppressed(later.startPosition.row, 'IED-R010')) {
              ctx.report({
                message: `\`${freed.name}\` is used after being freed — use after free.`,
                severity: Severity.Warning,
                range: nodeRange(later),
                data: { variable: freed.name }
              });
            }
            break; // one report per free is enough
          }
        }
      }
    }
  }
};
