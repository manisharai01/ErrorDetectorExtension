/**
 * IED-L002 — promise-swallowing
 *
 * Flags promise-returning calls used as bare expression statements without
 * being awaited or having a rejection handler. Ported from the original
 * TypeScript-compiler-based rule to Tree-sitter.
 *
 * Conservative heuristics (keep false positives low):
 *   1. A bare `expression_statement` whose expression is a `call_expression`
 *      on a member ending in `.then` WITHOUT a chained `.catch`/`.finally`
 *      anywhere in the same member chain (unhandled rejection).
 *   2. A bare `expression_statement` call to a function whose name suggests
 *      async — the callee identifier/property ends with `Async`, or is a
 *      known promise-returning global (`fetch`) — that is NOT inside an
 *      `await_expression` and has no `.then`/`.catch` chained off it.
 *
 * This is a walk-based rule: it needs to inspect statement context and the
 * surrounding member chain, which Tree-sitter queries cannot express.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

/** Promise-returning globals worth flagging when called bare and unhandled. */
const PROMISE_GLOBALS = new Set(['fetch']);

const HANDLER_RE = /^(then|catch|finally)$/;

/** The callee name of a call_expression: the trailing identifier/property. */
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

/**
 * True if `node` (a call_expression) sits anywhere inside an await_expression
 * or a return_statement, walking up the ancestor chain. Either form means the
 * promise is handled by the caller.
 */
function isAwaitedOrReturned(node: TSNode): boolean {
  let cur: TSNode | null = node.parent;
  while (cur) {
    if (cur.type === 'await_expression' || cur.type === 'return_statement') return true;
    // Stop at statement boundaries other than the chain we are climbing.
    if (cur.type === 'expression_statement') return false;
    cur = cur.parent;
  }
  return false;
}

/**
 * True if a `.then`/`.catch`/`.finally` handler is chained anywhere off this
 * call — either further up (the call is `x.foo()` inside `x.foo().then(...)`)
 * or as the immediate member access on the statement expression.
 */
function hasHandlerInChain(call: TSNode): boolean {
  let cur: TSNode | null = call.parent;
  while (cur) {
    if (cur.type === 'member_expression') {
      const prop = cur.childForFieldName('property');
      if (prop && HANDLER_RE.test(prop.text)) return true;
    }
    if (cur.type === 'expression_statement') break;
    cur = cur.parent;
  }
  return false;
}

/** Is this member_expression's terminal property one of then/catch/finally? */
function memberHandlerName(call: TSNode): string | null {
  const fn = call.childForFieldName('function');
  if (!fn || fn.type !== 'member_expression') return null;
  const prop = fn.childForFieldName('property');
  return prop && HANDLER_RE.test(prop.text) ? prop.text : null;
}

export const promiseSwallowingRule: Rule = {
  id: 'IED-L002',
  name: 'promise-swallowing',
  category: 'logic',
  severity: Severity.Warning,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue'],
  description: 'Promise-returning calls used as statements without await or rejection handling.',
  docs: [
    '# promise-swallowing (IED-L002)',
    '',
    'A promise-returning call used as a bare statement that is neither awaited,',
    'returned, nor given a `.catch`/`.then` handler swallows errors and ordering.',
    '',
    '```js',
    'fetch("/api");            // flagged: not awaited, no .catch',
    'doWork().then(handle);    // flagged: .then with no .catch',
    'loadAsync();              // flagged: name ends with Async, unhandled',
    '```',
    '',
    '```js',
    'await fetch("/api");      // ok',
    'fetch("/api").catch(e);   // ok',
    'return doWork().then(h);  // ok',
    '```',
    '',
    'Conservative by design to keep false positives low. Suppress with',
    '`// ied-disable-next-line IED-L002`.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (node.type === 'expression_statement') {
        // The expression of the statement, unwrapping any leading await.
        const expr = node.namedChild(0);
        if (expr && expr.type === 'call_expression') {
          inspectStatementCall(ctx, expr);
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child);
      }
    };
    walk(ctx.tree.rootNode);
  }
};

function inspectStatementCall(ctx: RuleContext, call: TSNode): void {
  const row = call.startPosition.row;
  if (ctx.isSuppressed(row, 'IED-L002')) return;

  // Case 1: the statement is `something.then(...)` with no .catch/.finally.
  // We want the OUTERMOST call in the chain to decide whether the whole chain
  // is handled. The statement's expression call may itself be the `.then` call.
  const terminalHandler = memberHandlerName(call);
  if (terminalHandler === 'then') {
    // It's a `.then(...)` call as the statement expression. Unhandled unless a
    // `.catch`/`.finally` is chained after it (which would make the statement's
    // expression be that outer call instead — so if we are here, there is none).
    ctx.report({
      message: 'Promise ".then(...)" used without a ".catch"/".finally" rejection handler.',
      severity: Severity.Warning,
      range: nodeRange(call),
      data: { kind: 'unhandled-then' }
    });
    return;
  }
  if (terminalHandler === 'catch' || terminalHandler === 'finally') {
    // The chain is handled; nothing to report.
    return;
  }

  // Case 2: a bare call whose name suggests async, not awaited/returned and not
  // chained with a handler.
  const name = calleeName(call);
  if (!name) return;
  const looksAsync = name.endsWith('Async') || PROMISE_GLOBALS.has(name);
  if (!looksAsync) return;
  if (isAwaitedOrReturned(call)) return;
  if (hasHandlerInChain(call)) return;

  ctx.report({
    message: `Promise from "${name}" is neither awaited nor handled with .then/.catch.`,
    severity: Severity.Warning,
    range: nodeRange(call),
    data: { kind: 'unawaited-call', callee: name }
  });
}
