/**
 * IED-L023 — inconsistent-return
 *
 * A function whose `return` statements disagree about what it returns — so
 * every caller has to guess. Ported from the legacy project-graph
 * "inconsistent return shapes" heuristic, per function:
 *
 *   1. Some paths `return value;` while another does a bare `return;`
 *      (callers silently get `undefined`).
 *   2. Literal returns of different kinds — e.g. a string on one path and a
 *      number on another (`return "error"` vs `return 0`).
 *   3. Object literals with no key in common (`{ data }` vs `{ error }`), so
 *      a caller reading `result.data` breaks on the other path. Objects that
 *      share a discriminant (`{ ok: true, data }` / `{ ok: false, error }`)
 *      are fine.
 *
 * `null`/`undefined` returns are deliberately ignored (the common "not found"
 * convention), as are generators and returns inside nested functions (each
 * function is judged on its own returns).
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';
import { EnclosingStack, JS_FUNCTION_TYPES, spanOf } from '../util';

const GENERATORS = new Set(['generator_function', 'generator_function_declaration']);

/** Literal kind of a return value, or null when it is not a plain literal. */
function literalKind(value: TSNode): string | null {
  switch (value.type) {
    case 'string':
    case 'template_string':
      return 'string';
    case 'number':
      return 'number';
    case 'true':
    case 'false':
      return 'boolean';
    case 'array':
      return 'array';
    case 'object':
      return 'object';
    default:
      return null;
  }
}

/** The key names of an object literal, or null if a spread makes it open-ended. */
function objectKeys(obj: TSNode): Set<string> | null {
  const keys = new Set<string>();
  for (let i = 0; i < obj.namedChildCount; i++) {
    const member = obj.namedChild(i);
    if (!member) continue;
    if (member.type === 'spread_element') return null;
    if (member.type === 'shorthand_property_identifier') {
      keys.add(member.text);
      continue;
    }
    const key = member.childForFieldName('key') ?? member.childForFieldName('name');
    if (!key || key.type === 'computed_property_name') return null;
    keys.add(key.text.replace(/^['"]|['"]$/g, ''));
  }
  return keys;
}

function functionName(fn: TSNode): string {
  const name = fn.childForFieldName('name');
  if (name) return name.text;
  const parent = fn.parent;
  if (parent?.type === 'variable_declarator' || parent?.type === 'pair') {
    const n = parent.childForFieldName('name') ?? parent.childForFieldName('key');
    if (n) return n.text;
  }
  return '<anonymous>';
}

interface FunctionReturns {
  fn: TSNode;
  values: TSNode[];
  bare: TSNode[];
}

export const inconsistentReturnRule: Rule = {
  id: 'IED-L023',
  name: 'inconsistent-return',
  category: 'logic',
  severity: Severity.Warning,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue'],
  description: 'A function returns different kinds of values (or sometimes nothing) on different paths.',
  docs: [
    '# inconsistent-return (IED-L023)',
    '',
    'When the return statements of one function disagree, callers break on the',
    'path they did not expect:',
    '',
    '```js',
    'function parse(input) {',
    '  if (!input) return;          // flagged: undefined here …',
    '  return JSON.parse(input);    // … a value everywhere else',
    '}',
    '',
    'function load(id) {',
    '  if (cache.has(id)) return { data: cache.get(id) };',
    '  return { error: "miss" };    // flagged: no key in common with { data }',
    '}',
    '```',
    '',
    'Return the same shape on every path (e.g. `{ ok, data, error }`), or',
    'return `null` explicitly for "nothing".'
  ].join('\n'),

  nodeTypes: () => [...JS_FUNCTION_TYPES, 'return_statement'],

  run(ctx: RuleContext): void {
    const functions: FunctionReturns[] = [];
    const scopes = new EnclosingStack<FunctionReturns | null>();

    for (const node of ctx.nodesOfType([...JS_FUNCTION_TYPES, 'return_statement'])) {
      scopes.at(spanOf(node));
      if (node.type !== 'return_statement') {
        const entry = GENERATORS.has(node.type) ? null : { fn: node, values: [], bare: [] };
        if (entry) functions.push(entry);
        scopes.push(spanOf(node), entry);
        continue;
      }
      const owner = scopes.innermost();
      if (!owner) continue;
      const value = node.namedChild(0);
      if (value) owner.values.push(value);
      else owner.bare.push(node);
    }

    for (const { fn, values, bare } of functions) {
      if (values.length === 0) continue;
      const name = functionName(fn);

      // 1. Value on some paths, nothing on others. A function that only ever
      // returns callbacks (React's `useEffect` cleanup pattern) is exempt.
      const onlyCallbacks = values.every((v) => v.type === 'arrow_function' || v.type === 'function_expression');
      if (bare.length > 0 && !onlyCallbacks) {
        const at = bare[0];
        if (!ctx.isSuppressed(at.startPosition.row, 'IED-L023')) {
          ctx.report({
            message: `Function "${name}" returns a value elsewhere but nothing here — callers get undefined on this path.`,
            severity: Severity.Warning,
            range: nodeRange(at),
            data: { function: name, kind: 'missing-value' }
          });
        }
        continue;
      }
      if (bare.length > 0) continue;

      // 2. Different literal kinds.
      const kinds = new Map<string, TSNode>();
      for (const v of values) {
        const kind = literalKind(v);
        if (kind && !kinds.has(kind)) kinds.set(kind, v);
      }
      if (kinds.size > 1) {
        const second = [...kinds.values()][1];
        if (!ctx.isSuppressed(second.startPosition.row, 'IED-L023')) {
          ctx.report({
            message: `Function "${name}" returns different kinds of value (${[...kinds.keys()].join(', ')}).`,
            severity: Severity.Warning,
            range: nodeRange(second),
            data: { function: name, kind: 'mixed-types', types: [...kinds.keys()] }
          });
        }
        continue;
      }

      // 3. Object literals that share no key.
      const shapes: Array<{ node: TSNode; keys: Set<string> }> = [];
      for (const v of values) {
        if (v.type !== 'object') continue;
        const keys = objectKeys(v);
        if (keys && keys.size > 0) shapes.push({ node: v, keys });
      }
      outer: for (let i = 1; i < shapes.length; i++) {
        for (let j = 0; j < i; j++) {
          const a = shapes[j];
          const b = shapes[i];
          if ([...b.keys].some((k) => a.keys.has(k))) continue;
          if (!ctx.isSuppressed(b.node.startPosition.row, 'IED-L023')) {
            ctx.report({
              message: `Function "${name}" returns objects with different shapes: {${[...a.keys].join(', ')}} vs {${[...b.keys].join(', ')}}.`,
              severity: Severity.Info,
              range: nodeRange(b.node),
              data: { function: name, kind: 'mixed-shapes' }
            });
          }
          break outer;
        }
      }
    }
  }
};
