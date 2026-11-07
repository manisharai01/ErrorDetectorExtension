/**
 * IED-L021 — missing-await
 *
 * Calls to an `async` function declared in this file whose Promise is silently
 * dropped. Two shapes (ported from the legacy `flow/missing-await-chain` rule,
 * extended to whole-file async functions):
 *
 *   1. Inside an async function, a bare statement `save(x);` / `this.save(x);`
 *      where `save` is async — execution continues before it finishes and a
 *      rejection is unhandled. Quick fix: insert `await`.
 *   2. Inside a `.then(…)` callback, the same bare call — the chain moves on
 *      before the inner promise settles. Quick fix: insert `return`.
 *
 * Names ending in `Async` and `fetch` are left to promise-swallowing (IED-L002)
 * so a call is never reported twice. Calls from plain sync code are not
 * flagged (there is nothing to await there).
 */

import {
  Severity,
  nodeRange,
  type Diagnostic,
  type Rule,
  type RuleContext,
  type TextEdit,
  type TSNode
} from '../types';
import {
  EnclosingStack,
  JS_FUNCTION_TYPES,
  isAsyncJsFunction,
  offsetAt,
  spanOf
} from '../util';

const DECLARED_FUNCTION_TYPES = ['function_declaration', 'generator_function_declaration', 'method_definition'];

interface Frame {
  async: boolean;
  thenCallback: boolean;
}

/** Async functions declared in the file, by name. */
function asyncFunctionNames(ctx: RuleContext): Set<string> {
  const names = new Set<string>();
  for (const fn of ctx.nodesOfType(DECLARED_FUNCTION_TYPES)) {
    const name = fn.childForFieldName('name');
    if (name && isAsyncJsFunction(fn)) names.add(name.text);
  }
  // const save = async (…) => {…} / async function (…) {…}
  for (const d of ctx.nodesOfType('variable_declarator')) {
    const name = d.childForFieldName('name');
    const value = d.childForFieldName('value');
    if (!name || name.type !== 'identifier' || !value) continue;
    if ((value.type === 'arrow_function' || value.type === 'function_expression') && isAsyncJsFunction(value)) {
      names.add(name.text);
    }
  }
  return names;
}

/** True when `fn` is passed as an argument to a `.then(…)` call. */
function isThenCallback(fn: TSNode): boolean {
  const args = fn.parent;
  if (!args || args.type !== 'arguments') return false;
  const callee = args.parent?.childForFieldName('function');
  return callee?.type === 'member_expression' && callee.childForFieldName('property')?.text === 'then';
}

/** `name(…)` or `this.name(…)` → name; anything else → null. */
function localCallee(call: TSNode): string | null {
  const fn = call.childForFieldName('function');
  if (!fn) return null;
  if (fn.type === 'identifier') return fn.text;
  if (fn.type === 'member_expression' && fn.childForFieldName('object')?.type === 'this') {
    return fn.childForFieldName('property')?.text ?? null;
  }
  return null;
}

export const missingAwaitRule: Rule = {
  id: 'IED-L021',
  name: 'missing-await',
  category: 'logic',
  severity: Severity.Warning,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue'],
  description: 'An async function is called without await (or without returning it from a .then callback).',
  docs: [
    '# missing-await (IED-L021)',
    '',
    'Calling an `async` function without `await` drops its Promise: the next',
    'line runs before it finishes, and a rejection is never handled.',
    '',
    '```js',
    'async function save(user) { await db.put(user); }',
    '',
    'async function onSubmit(user) {',
    '  save(user);            // flagged — add await',
    '  showToast("Saved!");   // runs before the save completes',
    '}',
    '',
    'load().then(() => { save(user); });   // flagged — return the promise',
    '```',
    '',
    'Quick fix: insert `await` (or `return` inside a `.then` callback).'
  ].join('\n'),

  nodeTypes: () => [...JS_FUNCTION_TYPES, 'variable_declarator', 'expression_statement'],

  run(ctx: RuleContext): void {
    const asyncNames = asyncFunctionNames(ctx);
    if (asyncNames.size === 0) return;

    const functions = new EnclosingStack<Frame>();
    for (const node of ctx.nodesOfType([...JS_FUNCTION_TYPES, 'expression_statement'])) {
      functions.at(spanOf(node));
      if (node.type !== 'expression_statement') {
        functions.push(spanOf(node), { async: isAsyncJsFunction(node), thenCallback: isThenCallback(node) });
        continue;
      }
      const frame = functions.innermost();
      if (!frame || (!frame.async && !frame.thenCallback)) continue;
      const call = node.namedChild(0);
      if (!call || call.type !== 'call_expression') continue;
      const name = localCallee(call);
      if (!name || !asyncNames.has(name)) continue;
      // Left to promise-swallowing (IED-L002), which already reports these.
      if (name.endsWith('Async') || name === 'fetch') continue;
      if (ctx.isSuppressed(call.startPosition.row, 'IED-L021')) continue;

      const fix = frame.async ? 'await' : 'return';
      ctx.report({
        message: frame.async
          ? `"${name}()" is async but is not awaited — the next line runs before it finishes and its errors are unhandled.`
          : `Promise from "${name}()" inside a .then() callback is neither returned nor awaited — the chain continues before it settles.`,
        severity: Severity.Warning,
        range: nodeRange(call),
        data: { callee: name, fix }
      });
    }
  },

  fixTitle: (d) => (d.data?.fix === 'return' ? 'Return the promise' : 'Add await'),

  fix(diagnostic: Diagnostic, sourceCode: string): TextEdit[] | null {
    const kind = diagnostic.data?.fix;
    if (kind !== 'await' && kind !== 'return') return null;
    const at = offsetAt(sourceCode, diagnostic.range.start);
    return [{ startIndex: at, endIndex: at, newText: `${kind} ` }];
  }
};
