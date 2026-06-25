/**
 * React framework rules (ported from src/rules/framework-specific/react.ts).
 *
 *   IED-F001 hook-deps           — useEffect/useCallback/useMemo with no dependency array
 *   IED-F002 missing-key         — JSX returned from .map() without a `key` prop
 *   IED-F003 state-mutation      — direct mutation/reassignment of useState value
 *   IED-F004 state-after-unmount — setX(...) inside a .then() callback (heuristic)
 *
 * All four are Tree-sitter walk-based: they need cross-node state (binding
 * collection, ancestor lookups, nesting checks) that stateless queries cannot
 * express. Each rule is exported individually and bundled in `reactRules`.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

/** Hooks whose final argument should be a dependency array. */
const HOOKS_WITH_DEPS = new Set([
  'useEffect',
  'useCallback',
  'useMemo',
  'useLayoutEffect'
]);

/** Array methods that mutate the array in place. */
const MUTATING_METHODS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]);

/** Walk every descendant of `root`, calling `fn` on each node. */
function walkAll(root: TSNode, fn: (n: TSNode) => void): void {
  fn(root);
  for (let i = 0; i < root.childCount; i++) {
    const child = root.child(i);
    if (child) walkAll(child, fn);
  }
}

/**
 * For a call_expression, return the callee's simple name:
 *  - `foo(...)`        -> "foo"
 *  - `React.foo(...)`  -> "foo"   (the property name)
 * or null for anything else.
 */
function calleeName(call: TSNode): string | null {
  const fn = call.childForFieldName('function');
  if (!fn) return null;
  if (fn.type === 'identifier') return fn.text;
  if (fn.type === 'member_expression') {
    const prop = fn.childForFieldName('property');
    return prop ? prop.text : null;
  }
  return null;
}

/** Number of arguments passed to a call_expression. */
function argCount(call: TSNode): number {
  const args = call.childForFieldName('arguments');
  if (!args) return 0;
  return args.namedChildCount;
}

// ── IED-F001 hook-deps ───────────────────────────────────────────────────────

export const hookDepsRule: Rule = {
  id: 'IED-F001',
  name: 'hook-deps',
  category: 'framework',
  severity: Severity.Warning,
  languages: ['jsx', 'tsx', 'javascript', 'typescript'],
  description: 'React effect/memo hook called without a dependency array.',
  docs: [
    '# hook-deps (IED-F001)',
    '',
    '`useEffect`, `useCallback`, `useMemo` and `useLayoutEffect` take a',
    'dependency array as their second argument. Calling them with only the',
    'callback re-runs the effect on every render.',
    '',
    '```jsx',
    'useEffect(() => { load(); });        // flagged — no deps array',
    'useEffect(() => { load(); }, []);    // ok',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    walkAll(ctx.tree.rootNode, (n) => {
      if (n.type !== 'call_expression') return;
      const name = calleeName(n);
      if (!name || !HOOKS_WITH_DEPS.has(name)) return;
      // Missing dependency array == fewer than 2 arguments (callback only).
      if (argCount(n) >= 2) return;
      if (ctx.isSuppressed(n.startPosition.row, 'IED-F001')) return;
      ctx.report({
        message: `${name} called without a dependency array.`,
        severity: Severity.Warning,
        range: nodeRange(n),
        data: { hook: name }
      });
    });
  }
};

// ── IED-F002 missing-key ─────────────────────────────────────────────────────

/** Find the first JSX element/self-closing element under `node`. */
function findFirstJsx(node: TSNode): TSNode | null {
  if (node.type === 'jsx_element' || node.type === 'jsx_self_closing_element') {
    return node;
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    const found = findFirstJsx(child);
    if (found) return found;
  }
  return null;
}

/** The opening element of a jsx_element, or the self-closing element itself. */
function openingOf(jsx: TSNode): TSNode {
  if (jsx.type === 'jsx_self_closing_element') return jsx;
  for (let i = 0; i < jsx.childCount; i++) {
    const child = jsx.child(i);
    if (child && child.type === 'jsx_opening_element') return child;
  }
  return jsx;
}

/** True if the JSX element carries a `key` attribute. */
function hasKeyAttribute(jsx: TSNode): boolean {
  const opening = openingOf(jsx);
  for (let i = 0; i < opening.childCount; i++) {
    const attr = opening.child(i);
    if (!attr || attr.type !== 'jsx_attribute') continue;
    // The attribute name is the first child (a property_identifier).
    const nameNode = attr.namedChild(0);
    if (nameNode && nameNode.text === 'key') return true;
  }
  return false;
}

export const missingKeyRule: Rule = {
  id: 'IED-F002',
  name: 'missing-key',
  category: 'framework',
  severity: Severity.Warning,
  languages: ['jsx', 'tsx'],
  description: 'JSX returned from .map() without a key prop.',
  docs: [
    '# missing-key (IED-F002)',
    '',
    'Elements rendered from `.map()` need a stable `key` prop so React can',
    'reconcile the list efficiently.',
    '',
    '```jsx',
    'items.map((i) => <li>{i}</li>)             // flagged',
    'items.map((i) => <li key={i.id}>{i}</li>)  // ok',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    walkAll(ctx.tree.rootNode, (n) => {
      if (n.type !== 'call_expression') return;
      const fn = n.childForFieldName('function');
      if (!fn || fn.type !== 'member_expression') return;
      const prop = fn.childForFieldName('property');
      if (!prop || prop.text !== 'map') return;

      const args = n.childForFieldName('arguments');
      const callback = args ? args.namedChild(0) : null;
      if (
        !callback ||
        (callback.type !== 'arrow_function' &&
          callback.type !== 'function_expression')
      ) {
        return;
      }
      const body = callback.childForFieldName('body');
      if (!body) return;
      const jsx = findFirstJsx(body);
      if (!jsx) return;
      if (hasKeyAttribute(jsx)) return;
      if (ctx.isSuppressed(jsx.startPosition.row, 'IED-F002')) return;
      ctx.report({
        message: 'JSX element returned from .map() is missing a "key" prop.',
        severity: Severity.Warning,
        range: nodeRange(jsx),
        data: {}
      });
    });
  }
};

// ── IED-F003 state-mutation ──────────────────────────────────────────────────

/**
 * Collect the first element name of every `const [x, setX] = useState(...)`.
 * Returns the set of state value identifiers (the `x`).
 */
function collectStateVars(root: TSNode): Set<string> {
  const stateVars = new Set<string>();
  walkAll(root, (n) => {
    if (n.type !== 'variable_declarator') return;
    const nameNode = n.childForFieldName('name');
    const value = n.childForFieldName('value');
    if (!nameNode || nameNode.type !== 'array_pattern') return;
    if (!value || value.type !== 'call_expression') return;
    if (calleeName(value) !== 'useState') return;
    // First named child of the array_pattern is the state value binding.
    const first = nameNode.namedChild(0);
    if (first && first.type === 'identifier') {
      stateVars.add(first.text);
    }
  });
  return stateVars;
}

/** The root identifier of a member_expression chain (`a.b.c` -> "a"), or null. */
function rootIdentifier(node: TSNode): string | null {
  let cur: TSNode | null = node;
  while (cur && cur.type === 'member_expression') {
    cur = cur.childForFieldName('object');
  }
  return cur && cur.type === 'identifier' ? cur.text : null;
}

export const stateMutationRule: Rule = {
  id: 'IED-F003',
  name: 'state-mutation',
  category: 'framework',
  severity: Severity.Warning,
  languages: ['jsx', 'tsx', 'javascript', 'typescript'],
  description: 'Direct mutation or reassignment of a useState value.',
  docs: [
    '# state-mutation (IED-F003)',
    '',
    'State from `useState` is immutable from the component\'s point of view.',
    'Mutating it in place (`.push`, `.sort`, …) or reassigning it directly',
    'will not trigger a re-render — use the setter instead.',
    '',
    '```jsx',
    'const [items, setItems] = useState([]);',
    'items.push(x);   // flagged — mutates state',
    'items = next;    // flagged — reassigns state',
    'setItems([...items, x]); // ok',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const stateVars = collectStateVars(ctx.tree.rootNode);
    if (stateVars.size === 0) return;

    walkAll(ctx.tree.rootNode, (n) => {
      // (a) Mutating method call: x.push(...) / x.sort(...) etc.
      if (n.type === 'call_expression') {
        const fn = n.childForFieldName('function');
        if (fn && fn.type === 'member_expression') {
          const obj = fn.childForFieldName('object');
          const prop = fn.childForFieldName('property');
          if (
            obj &&
            obj.type === 'identifier' &&
            stateVars.has(obj.text) &&
            prop &&
            MUTATING_METHODS.has(prop.text)
          ) {
            if (!ctx.isSuppressed(n.startPosition.row, 'IED-F003')) {
              ctx.report({
                message: `Direct mutation of state "${obj.text}" via .${prop.text}().`,
                severity: Severity.Warning,
                range: nodeRange(n),
                data: { state: obj.text, method: prop.text }
              });
            }
          }
        }
        return;
      }

      // (b) Reassignment: x = ... or x.foo = ... where x is a state var.
      if (n.type === 'assignment_expression') {
        const left = n.childForFieldName('left');
        if (!left) return;
        let stateName: string | null = null;
        if (left.type === 'identifier' && stateVars.has(left.text)) {
          stateName = left.text;
        } else if (left.type === 'member_expression') {
          const root = rootIdentifier(left);
          if (root && stateVars.has(root)) stateName = root;
        } else if (left.type === 'subscript_expression') {
          const obj = left.childForFieldName('object');
          if (obj && obj.type === 'identifier' && stateVars.has(obj.text)) {
            stateName = obj.text;
          }
        }
        if (stateName && !ctx.isSuppressed(n.startPosition.row, 'IED-F003')) {
          ctx.report({
            message: `Direct mutation of state "${stateName}" — use its setter instead.`,
            severity: Severity.Warning,
            range: nodeRange(n),
            data: { state: stateName }
          });
        }
      }
    });
  }
};

// ── IED-F004 state-after-unmount ─────────────────────────────────────────────

/**
 * True if `node` has an ancestor call_expression of the form `something.then(...)`
 * (i.e. the node lives inside a `.then()` callback). Conservative heuristic for
 * "setState fired after an async resolution".
 */
function insideThenCallback(node: TSNode): boolean {
  let p: TSNode | null = node.parent;
  while (p) {
    if (p.type === 'call_expression') {
      const fn = p.childForFieldName('function');
      if (fn && fn.type === 'member_expression') {
        const prop = fn.childForFieldName('property');
        if (prop && prop.text === 'then') return true;
      }
    }
    p = p.parent;
  }
  return false;
}

export const stateAfterUnmountRule: Rule = {
  id: 'IED-F004',
  name: 'state-after-unmount',
  category: 'framework',
  severity: Severity.Info,
  languages: ['jsx', 'tsx', 'javascript', 'typescript'],
  description: 'setState inside a .then() callback without an unmount guard.',
  docs: [
    '# state-after-unmount (IED-F004)',
    '',
    'Calling a `setX` updater inside an async `.then()` callback can update',
    'state after the component has unmounted. Guard with an `isMounted` flag or',
    'an `AbortController`.',
    '',
    '```jsx',
    'fetch(url).then((r) => setData(r)); // flagged (info)',
    '```',
    '',
    'Suppressed when the file already references `isMounted` / `AbortController`.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    // If the file already uses a guard, stay quiet — too noisy otherwise.
    if (/\b(isMounted|abortController|AbortController)\b/.test(ctx.sourceCode)) {
      return;
    }

    walkAll(ctx.tree.rootNode, (n) => {
      if (n.type !== 'call_expression') return;
      const fn = n.childForFieldName('function');
      // Only bare `setX(...)` calls (state setters), not member calls.
      if (!fn || fn.type !== 'identifier') return;
      if (!/^set[A-Z]/.test(fn.text)) return;
      if (!insideThenCallback(n)) return;
      if (ctx.isSuppressed(n.startPosition.row, 'IED-F004')) return;
      ctx.report({
        message: `${fn.text}() inside .then() without an unmount guard — may setState on an unmounted component.`,
        severity: Severity.Info,
        range: nodeRange(n),
        data: { setter: fn.text }
      });
    });
  }
};

/** All React framework rules, for bulk registration. */
export const reactRules: Rule[] = [
  hookDepsRule,
  missingKeyRule,
  stateMutationRule,
  stateAfterUnmountRule
];
