/**
 * IED-C009 — nested-mutex-lock (Rust)
 *
 * Acquiring a second `Mutex`/`RwLock` guard while a first guard is still alive
 * is a classic source of deadlocks: if another thread acquires the same two
 * locks in the opposite order, both threads block forever. The reliable fix is
 * to drop the first guard before taking the second, or to establish a global
 * lock ordering.
 *
 * Heuristic (intentionally conservative to keep false positives low):
 *   - Operate per `function_item` body.
 *   - Collect every `.lock()` method call (a `call_expression` whose function is
 *     a `field_expression` with `field` `field_identifier` == "lock").
 *   - Compute each lock call's *block depth* = how many `block` ancestors sit
 *     between it and the function body. A lock acquired and bound at the
 *     function's top level has depth 0; a lock inside a nested `{ ... }` (or an
 *     `if`/`match`/loop arm body) has depth >= 1.
 *   - If the function contains two or more lock calls AND a given lock call is
 *     nested *strictly deeper* than another lock call in the same function, the
 *     outer guard is presumably still alive when the inner lock is taken, so we
 *     flag the inner (deeper) lock.
 *
 * This deliberately ignores guard lifetimes, explicit `drop(...)`, and re-locks
 * of the same `Mutex`; it only fires on the lexically-nested two-lock shape the
 * contract describes. That misses some real deadlocks but rarely fires falsely.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

/** True if `node` is a `expr.lock()` method call. */
function isLockCall(node: TSNode): boolean {
  if (node.type !== 'call_expression') return false;
  const fn = node.childForFieldName('function');
  if (!fn || fn.type !== 'field_expression') return false;
  const field = fn.childForFieldName('field');
  return !!field && field.type === 'field_identifier' && field.text === 'lock';
}

export const nestedMutexLockRule: Rule = {
  id: 'IED-C009',
  name: 'nested-mutex-lock',
  category: 'concurrency',
  severity: Severity.Warning,
  languages: ['rust'],
  description: 'A mutex is locked while another lock guard is still held (deadlock risk).',
  docs: [
    '# nested-mutex-lock (IED-C009)',
    '',
    'Holding one lock guard while acquiring a second can deadlock if another',
    'thread takes the same locks in the opposite order.',
    '',
    '```rust',
    'let a = mutex_a.lock().unwrap();',
    '{',
    '    let b = mutex_b.lock().unwrap(); // flagged: a is still held',
    '}',
    '```',
    '',
    'Drop the first guard before locking again, or impose a consistent lock',
    'ordering across all call sites.',
    '',
    'Heuristic: within one function, an inner `.lock()` lexically nested deeper',
    'than another `.lock()` is reported. Guard lifetimes and explicit `drop` are',
    'not tracked, so this is conservative.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    // Find every function body, then analyse lock calls within it in isolation
    // so locks in unrelated functions never interact.
    const analyzeFunction = (body: TSNode): void => {
      interface LockSite {
        node: TSNode;
        depth: number;
      }
      const locks: LockSite[] = [];

      // Walk the function body, tracking how many `block` ancestors we have
      // descended through *below* the body itself. Do not descend into nested
      // function/closure bodies — those have their own guard scopes.
      const collect = (node: TSNode, depth: number): void => {
        if (node !== body && (node.type === 'function_item' || node.type === 'closure_expression')) {
          return;
        }
        if (isLockCall(node)) {
          locks.push({ node, depth });
        }
        const childDepth = node.type === 'block' && node !== body ? depth + 1 : depth;
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child) collect(child, childDepth);
        }
      };
      collect(body, 0);

      if (locks.length < 2) return;

      const minDepth = Math.min(...locks.map((l) => l.depth));
      for (const lock of locks) {
        // Flag a lock that is nested strictly deeper than the shallowest lock:
        // the shallower guard is presumably still alive at this point.
        if (lock.depth > minDepth) {
          if (!ctx.isSuppressed(lock.node.startPosition.row, 'IED-C009')) {
            ctx.report({
              message:
                'Mutex locked while another lock guard is still held; ' +
                'drop the outer guard first or enforce a lock ordering to avoid deadlock.',
              severity: Severity.Warning,
              range: nodeRange(lock.node),
              data: { depth: lock.depth }
            });
          }
        }
      }
    };

    const walk = (node: TSNode): void => {
      if (node.type === 'function_item' || node.type === 'closure_expression') {
        const body = node.childForFieldName('body');
        if (body && body.type === 'block') {
          analyzeFunction(body);
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
