/**
 * IED-R009 — retain-cycle (Swift)
 *
 * A closure that captures `self` strongly can create a reference cycle: the
 * object holds the closure and the closure holds the object, so neither is
 * ever deallocated. The idiomatic fix is a weak/unowned capture list:
 * `{ [weak self] in ... }` or `{ [unowned self] in ... }`.
 *
 * NODE SHAPE (verified against tree-sitter-swift):
 *   Every closure is a `lambda_literal` (the grammar has no `closure_expression`).
 *   A capture list is the `captures:` field -> (capture_list (capture_list_item
 *   (ownership_modifier) ...)). A strong reference to self appears in the body
 *   as a `self_expression` node.
 *
 * CONSERVATIVE HEURISTIC (to keep false positives low):
 *   Flag a `lambda_literal` that
 *     (a) has NO capture list with an `ownership_modifier` (weak/unowned), and
 *     (b) references `self` in its body (a `self_expression`).
 *   A closure that already declares `[weak self]` / `[unowned self]` is silent,
 *   as is one that never touches `self`. We do not attempt to distinguish
 *   escaping from non-escaping closures (that needs type information), so a
 *   non-escaping closure using `self` may be flagged — the suggested fix is
 *   still harmless there.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

/** True if the lambda's capture list contains an ownership modifier (weak/unowned). */
function hasWeakCapture(lambda: TSNode): boolean {
  const captures = lambda.childForFieldName('captures');
  if (!captures) return false;
  let found = false;
  const scan = (node: TSNode): void => {
    if (node.type === 'ownership_modifier') {
      found = true;
      return;
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) scan(child);
    }
  };
  scan(captures);
  return found;
}

/**
 * True if `self` is referenced inside `lambda`'s body, ignoring any nested
 * `lambda_literal` (a nested closure has its own capture semantics and is
 * evaluated as its own node by the outer walk).
 */
function bodyReferencesSelf(lambda: TSNode): boolean {
  const captures = lambda.childForFieldName('captures');
  let found = false;
  const scan = (node: TSNode): void => {
    if (found) return;
    if (node !== lambda && node.type === 'lambda_literal') return; // nested closure
    if (node === captures) return; // `[weak self]` etc. is not a body reference
    if (node.type === 'self_expression') {
      found = true;
      return;
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) scan(child);
    }
  };
  scan(lambda);
  return found;
}

export const retainCycleRule: Rule = {
  id: 'IED-R009',
  name: 'retain-cycle',
  category: 'resource',
  severity: Severity.Warning,
  languages: ['swift'],
  description: 'Closure captures `self` strongly without a [weak self] capture list.',
  docs: [
    '# retain-cycle (IED-R009)',
    '',
    'A closure that captures `self` strongly can form a reference cycle, leaking',
    'the object it belongs to:',
    '',
    '```swift',
    'manager.onUpdate = { self.refresh() } // flagged',
    '```',
    '',
    'Break the cycle with a capture list:',
    '',
    '```swift',
    'manager.onUpdate = { [weak self] in self?.refresh() }',
    '```',
    '',
    'Heuristic: a closure referencing `self` without a weak/unowned capture list',
    'is flagged. Closures that never touch `self`, or that already use',
    '`[weak self]` / `[unowned self]`, are silent.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (node.type === 'lambda_literal') {
        if (!hasWeakCapture(node) && bodyReferencesSelf(node)) {
          if (!ctx.isSuppressed(node.startPosition.row, 'IED-R009')) {
            ctx.report({
              message: 'Possible retain cycle: capture [weak self].',
              severity: Severity.Warning,
              range: nodeRange(node)
            });
          }
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
