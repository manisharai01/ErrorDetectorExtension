/**
 * IED-L012 — late-binding-closure
 *
 * Python closures capture variables by reference, not by value. A `lambda`
 * defined inside a loop or comprehension that references the loop variable will
 * see its FINAL value when later invoked, not the value at definition time.
 *
 * Conservative heuristic: flag a `lambda` whose body references a name equal to
 * the loop variable of an enclosing `for_statement`/`for_in_clause`, when the
 * lambda does NOT capture that name as a parameter default (`lambda x=x: ...`).
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const COMPREHENSIONS = new Set([
  'list_comprehension',
  'set_comprehension',
  'dictionary_comprehension',
  'generator_expression'
]);

/** Collect loop-variable names introduced by enclosing for-loops / comprehensions. */
function enclosingLoopVars(node: TSNode): Set<string> {
  const vars = new Set<string>();
  let cur: TSNode | null = node.parent;
  while (cur) {
    if (cur.type === 'for_statement' || cur.type === 'for_in_clause') {
      const left = cur.childForFieldName('left');
      if (left) collectNames(left, vars);
    } else if (COMPREHENSIONS.has(cur.type)) {
      // In a comprehension the lambda is the `body`; the `for_in_clause`(s) are
      // siblings, so scan the comprehension's children for their loop targets.
      for (let i = 0; i < cur.namedChildCount; i++) {
        const child = cur.namedChild(i);
        if (child && child.type === 'for_in_clause') {
          const left = child.childForFieldName('left');
          if (left) collectNames(left, vars);
        }
      }
    }
    cur = cur.parent;
  }
  return vars;
}

function collectNames(node: TSNode, out: Set<string>): void {
  if (node.type === 'identifier') {
    out.add(node.text);
    return;
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (c) collectNames(c, out);
  }
}

/** Names the lambda captures via parameters / defaults (so they are bound). */
function lambdaBoundNames(lambda: TSNode): Set<string> {
  const bound = new Set<string>();
  const params = lambda.childForFieldName('parameters');
  if (params) collectNames(params, bound);
  return bound;
}

/** True if `body` references `name` as an identifier (read of the closed-over var). */
function bodyReferences(body: TSNode, name: string): boolean {
  if (body.type === 'identifier') return body.text === name;
  for (let i = 0; i < body.namedChildCount; i++) {
    const c = body.namedChild(i);
    if (c && bodyReferences(c, name)) return true;
  }
  return false;
}

export const lateBindingClosureRule: Rule = {
  id: 'IED-L012',
  name: 'late-binding-closure',
  category: 'logic',
  severity: Severity.Warning,
  languages: ['python'],
  description: 'Closure in a loop captures the loop variable by reference (late binding).',
  docs: [
    '# late-binding-closure (IED-L012)',
    '',
    'A `lambda` created in a loop captures the loop variable by reference, so all',
    'the lambdas share its final value.',
    '',
    '```py',
    'fns = [lambda: i for i in range(3)]  # every fn returns 2',
    'fns = [lambda i=i: i for i in range(3)]  # fixed: bind i as a default',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (node.type === 'lambda') {
        const loopVars = enclosingLoopVars(node);
        if (loopVars.size > 0) {
          const bound = lambdaBoundNames(node);
          const body = node.childForFieldName('body');
          if (body) {
            for (const name of loopVars) {
              if (bound.has(name)) continue;
              if (bodyReferences(body, name)) {
                if (!ctx.isSuppressed(node.startPosition.row, 'IED-L012')) {
                  ctx.report({
                    message: `Closure captures loop variable \`${name}\` by reference; bind it as a default (\`lambda ${name}=${name}: ...\`).`,
                    severity: Severity.Warning,
                    range: nodeRange(node),
                    data: { variable: name }
                  });
                }
                break;
              }
            }
          }
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
