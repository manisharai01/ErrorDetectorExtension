/**
 * IED-C014 — unawaited-future (Dart)
 *
 * Inside an `async` function, a bare statement that calls an `async` function
 * declared in the same file — or `Future.delayed(...)` — without `await`
 * discards the Future: its errors are never seen and the next line runs before
 * it finishes (a `Future.delayed` without await does not pause at all).
 *
 * Only statements whose call result is discarded are flagged: `await f()`,
 * `f().then(...)`, `unawaited(f())` and assignments are all fine. Calls made
 * from non-async code (e.g. `initState`) are intentionally fire-and-forget and
 * are not flagged. Auto-fixable: inserts `await`.
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
import { EnclosingStack, functionNameNode, offsetAt, spanOf } from '../util';

const BODY_TYPES = ['function_body', 'function_expression_body'];

/** `async` / `async*` bodies start with the `async` keyword token. */
function isAsyncBody(body: TSNode): boolean {
  return body.child(0)?.type === 'async';
}

/**
 * The function a statement calls when the statement is exactly a call whose
 * result is discarded: `name(...)`, `this.name(...)` or `Future.delayed(...)`.
 * Anything chained after the arguments (`.then`, `.catchError`, `.ignore()`)
 * handles the Future, so it returns null.
 */
function discardedCall(stmt: TSNode): { name: string; future: boolean } | null {
  const parts: TSNode[] = [];
  for (let i = 0; i < stmt.namedChildCount; i++) {
    const c = stmt.namedChild(i);
    if (c) parts.push(c);
  }
  const last = parts[parts.length - 1];
  if (!last || last.type !== 'selector' || last.namedChild(0)?.type !== 'argument_part') return null;

  const member = (sel: TSNode | undefined): string | null => {
    if (!sel || sel.type !== 'selector') return null;
    const access = sel.namedChild(0);
    if (!access || access.type !== 'unconditional_assignable_selector') return null;
    const id = access.namedChild(0);
    return id && id.type === 'identifier' ? id.text : null;
  };

  if (parts.length === 2 && parts[0].type === 'identifier') {
    return { name: parts[0].text, future: false };
  }
  if (parts.length === 3 && parts[0].type === 'this') {
    const name = member(parts[1]);
    return name ? { name, future: false } : null;
  }
  if (parts.length === 3 && parts[0].type === 'identifier' && parts[0].text === 'Future') {
    return member(parts[1]) === 'delayed' ? { name: 'Future.delayed', future: true } : null;
  }
  return null;
}

export const dartUnawaitedFutureRule: Rule = {
  id: 'IED-C014',
  name: 'unawaited-future',
  category: 'concurrency',
  severity: Severity.Warning,
  languages: ['dart'],
  description: 'Future from an async call is discarded inside an async function.',
  docs: [
    '# unawaited-future (IED-C014)',
    '',
    'Inside an `async` function, calling another async function as a bare',
    'statement drops the Future: errors vanish and the next line runs before',
    'the call completes. `Future.delayed(...)` without `await` does not wait.',
    '',
    '```dart',
    'Future<void> refresh() async {',
    '  loadProfile();                          // flagged',
    '  Future.delayed(Duration(seconds: 1));   // flagged — no pause happens',
    '  await loadProfile();                    // ok',
    '  unawaited(loadProfile());               // ok — explicit fire-and-forget',
    '}',
    '```',
    '',
    'Quick fix: insert `await`.'
  ].join('\n'),

  nodeTypes: () => [...BODY_TYPES, 'expression_statement'],

  run(ctx: RuleContext): void {
    // Names of the async functions/methods declared in this file.
    const asyncNames = new Set<string>();
    for (const body of ctx.nodesOfType('function_body')) {
      if (!isAsyncBody(body)) continue;
      const name = functionNameNode(body);
      if (name) asyncNames.add(name.text);
    }

    const bodies = new EnclosingStack<boolean>();
    for (const node of ctx.nodesOfType([...BODY_TYPES, 'expression_statement'])) {
      bodies.at(spanOf(node));
      if (node.type !== 'expression_statement') {
        bodies.push(spanOf(node), isAsyncBody(node));
        continue;
      }
      if (!bodies.innermost()) continue; // not directly inside an async body
      const call = discardedCall(node);
      if (!call || (!call.future && !asyncNames.has(call.name))) continue;
      if (ctx.isSuppressed(node.startPosition.row, 'IED-C014')) continue;
      ctx.report({
        message: call.future
          ? 'Future.delayed(...) is not awaited, so nothing waits for it — add await.'
          : `Future returned by ${call.name}() is not awaited — errors are lost and the next line runs before it completes. Add await, or wrap it in unawaited(...).`,
        severity: Severity.Warning,
        range: nodeRange(node),
        data: { callee: call.name }
      });
    }
  },

  fixTitle: () => 'Add await',

  fix(diagnostic: Diagnostic, sourceCode: string): TextEdit[] | null {
    const at = offsetAt(sourceCode, diagnostic.range.start);
    return [{ startIndex: at, endIndex: at, newText: 'await ' }];
  }
};
