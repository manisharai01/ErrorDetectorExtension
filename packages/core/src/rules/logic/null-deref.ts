/**
 * IED-L022 — null-deref
 *
 * A variable that can be null/undefined is dereferenced before anything checks
 * it. Covers the values that most often are:
 *
 *   - APIs that return null/undefined on "not found": `arr.find()`,
 *     `arr.findLast()`, `document.querySelector()` / `getElementById()` /
 *     `el.closest()`, `str.match()`, `regex.exec()`, `storage.getItem()`,
 *     `someMap.get()` (receiver named *map / *cache);
 *   - `let x;`, `let x = null;`, `let x = undefined;`;
 *   - TypeScript optional parameters (`function f(opts?: Options)`).
 *
 * Flow model (no CFG, deliberately conservative): starting after the
 * declaration, find the FIRST reference to the variable in the following
 * statements of the same block (or the function body for a parameter). Only
 * when that first reference is a dereference — `x.prop`, `x[i]` or `x()`
 * without optional chaining — is it reported. Any other first use (a condition,
 * `x?.y`, `x ?? d`, an assignment, passing it on, a reference inside a closure)
 * ends tracking without a report, so guarded code is never flagged.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';
import { JS_FUNCTION_TYPES } from '../util';

const FUNCTION_SET = new Set(JS_FUNCTION_TYPES);

/** Methods that return null/undefined when nothing is found. */
const NULLABLE_METHODS = new Set([
  'find',
  'findLast',
  'querySelector',
  'getElementById',
  'closest',
  'match',
  'getItem'
]);

const REGEX_NAME = /(?:re|regex|regexp|pattern)$/i;
const MAP_NAME = /(?:map|cache)$/i;

/** Why `value` may be null, or null when it is not a nullable source. */
function nullableSource(value: TSNode | null): string | null {
  if (!value) return 'it is declared without a value';
  if (value.type === 'null') return 'it is initialised to null';
  if (value.type === 'undefined') return 'it is initialised to undefined';
  if (value.type !== 'call_expression') return null;
  const fn = value.childForFieldName('function');
  if (!fn || fn.type !== 'member_expression' || fn.childForFieldName('optional_chain')) return null;
  const method = fn.childForFieldName('property')?.text;
  const object = fn.childForFieldName('object');
  if (!method || !object) return null;
  if (NULLABLE_METHODS.has(method)) return `.${method}() can return null/undefined`;
  if (method === 'exec' && (object.type === 'regex' || (object.type === 'identifier' && REGEX_NAME.test(object.text)))) {
    return '.exec() returns null when there is no match';
  }
  if (method === 'get' && object.type === 'identifier' && MAP_NAME.test(object.text)) {
    return `${object.text}.get() returns undefined for a missing key`;
  }
  return null;
}

/**
 * How `id` (a reference to the tracked variable) is used: 'deref' when it is
 * the object of `.prop` / `[i]` or the callee of a call, without `?.`.
 */
function isDereference(id: TSNode): boolean {
  const parent = id.parent;
  if (!parent) return false;
  const sameAs = (n: TSNode | null): boolean => !!n && n.startIndex === id.startIndex && n.type === id.type;
  if (parent.type === 'member_expression' || parent.type === 'subscript_expression') {
    return sameAs(parent.childForFieldName('object')) && !parent.childForFieldName('optional_chain');
  }
  if (parent.type === 'call_expression') {
    return sameAs(parent.childForFieldName('function')) && !parent.childForFieldName('optional_chain');
  }
  return false;
}

/** True when `node` sits inside a function nested within `scope`. */
function insideNestedFunction(node: TSNode, scope: TSNode): boolean {
  for (let cur = node.parent; cur && cur.startIndex >= scope.startIndex; cur = cur.parent) {
    if (cur.startIndex === scope.startIndex && cur.type === scope.type) return false;
    if (FUNCTION_SET.has(cur.type)) return true;
  }
  return false;
}

/**
 * The first reference to `name` among `statements` (document order), or null.
 * `scope` bounds the closure check.
 */
function firstReference(name: string, statements: TSNode[], scope: TSNode): TSNode | null {
  for (const stmt of statements) {
    // `{ user }` in an object literal references `user` too (and is not a deref).
    for (const id of stmt.descendantsOfType(['identifier', 'shorthand_property_identifier'])) {
      if (id.text !== name) continue;
      return insideNestedFunction(id, scope) ? null : id;
    }
  }
  return null;
}

function followingStatements(stmt: TSNode): TSNode[] {
  const out: TSNode[] = [];
  for (let s = stmt.nextNamedSibling; s; s = s.nextNamedSibling) out.push(s);
  return out;
}

function bodyStatements(body: TSNode): TSNode[] {
  const out: TSNode[] = [];
  for (let i = 0; i < body.namedChildCount; i++) {
    const s = body.namedChild(i);
    if (s) out.push(s);
  }
  return out;
}

export const nullDerefRule: Rule = {
  id: 'IED-L022',
  name: 'null-deref',
  category: 'logic',
  severity: Severity.Warning,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue'],
  description: 'A value that may be null/undefined is dereferenced before it is checked.',
  docs: [
    '# null-deref (IED-L022)',
    '',
    'Values from `find()`, `querySelector()`, `match()`, `Map.get()`, … are',
    'null/undefined when nothing matches. Dereferencing one before checking it',
    'is the classic "Cannot read properties of undefined" crash.',
    '',
    '```js',
    'const user = users.find((u) => u.id === id);',
    'return user.name;                 // flagged',
    '',
    'const user = users.find((u) => u.id === id);',
    'if (!user) throw new NotFound();  // ok — checked first',
    'return user.name;',
    '```',
    '',
    'Use a guard, optional chaining (`user?.name`) or a default (`?? fallback`).'
  ].join('\n'),

  nodeTypes: () => ['variable_declarator', 'optional_parameter'],

  run(ctx: RuleContext): void {
    const report = (name: string, ref: TSNode, why: string): void => {
      if (ctx.isSuppressed(ref.startPosition.row, 'IED-L022')) return;
      const access = ref.parent ?? ref;
      ctx.report({
        message: `"${name}" may be null/undefined here (${why}) — check it first or use optional chaining.`,
        severity: Severity.Warning,
        range: nodeRange(access),
        data: { variable: name }
      });
    };

    // Local variables initialised from a nullable source.
    for (const d of ctx.nodesOfType('variable_declarator')) {
      const nameNode = d.childForFieldName('name');
      if (!nameNode) continue;
      if (nameNode.type === 'object_pattern' || nameNode.type === 'array_pattern') {
        // `const { id } = users.find(…)` throws immediately when nothing matches.
        const value = d.childForFieldName('value');
        const why = value ? nullableSource(value) : null;
        if (why && value?.type === 'call_expression' && !ctx.isSuppressed(d.startPosition.row, 'IED-L022')) {
          ctx.report({
            message: `Destructuring a value that may be null/undefined (${why}) throws when nothing is found.`,
            severity: Severity.Warning,
            range: nodeRange(d),
            data: { variable: nameNode.text }
          });
        }
        continue;
      }
      if (nameNode.type !== 'identifier') continue;
      const decl = d.parent;
      if (!decl || (decl.type !== 'lexical_declaration' && decl.type !== 'variable_declaration')) continue;
      const value = d.childForFieldName('value');
      // `const x;` is a syntax error and `var x;` is usually hoisting style; only
      // an uninitialised `let` is tracked as "undefined".
      if (!value && decl.child(0)?.type !== 'let') continue;
      const why = nullableSource(value);
      if (!why) continue;
      const block = decl.parent;
      if (!block) continue;
      const ref = firstReference(nameNode.text, followingStatements(decl), block);
      if (ref && isDereference(ref)) report(nameNode.text, ref, why);
    }

    // TypeScript optional parameters: `function f(opts?: Options) { opts.x }`.
    for (const param of ctx.nodesOfType('optional_parameter')) {
      const pattern = param.childForFieldName('pattern');
      if (!pattern || pattern.type !== 'identifier' || param.childForFieldName('value')) continue;
      const fn = param.parent?.parent;
      const body = fn?.childForFieldName('body');
      if (!fn || !body || body.type !== 'statement_block') continue;
      const ref = firstReference(pattern.text, bodyStatements(body), fn);
      if (ref && isDereference(ref)) report(pattern.text, ref, 'it is an optional parameter');
    }
  }
};
