/**
 * IED-C012 — main-actor-violation (Swift)
 *
 * UIKit views are not thread-safe and must only be mutated on the main thread.
 * A common bug is assigning to a UI property (e.g. `label.text`, `view.image`,
 * `button.backgroundColor`) from inside a background-queue closure, which races
 * with UIKit and can crash or corrupt the UI. The fix is to hop back to the
 * main actor before touching the view.
 *
 * NODE SHAPE (verified against tree-sitter-swift):
 *   `DispatchQueue.global().async { ... }`
 *     -> call_expression
 *          callee: navigation_expression           (the `.async`)
 *                    target: call_expression        (`DispatchQueue.global(...)`)
 *                              callee: navigation_expression
 *                                        target: (simple_identifier "DispatchQueue")
 *                                        suffix: navigation_suffix -> "global"
 *          call_suffix: (lambda_literal (statements ...))
 *   A UI assignment inside the closure:
 *     (assignment target: (directly_assignable_expression
 *        (navigation_expression ... suffix: (navigation_suffix suffix:
 *           (simple_identifier "text")))))
 *
 * CONSERVATIVE HEURISTIC (to keep false positives low):
 *   Flag an assignment to a UI property (`text`/`image`/`backgroundColor`/...)
 *   when it sits inside a closure passed to a `DispatchQueue.global(...)` call.
 *   `DispatchQueue.main` is explicitly excluded. This deliberately ignores the
 *   harder general case (mutating UIKit off any non-main context) to avoid
 *   noise.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

/** UI properties whose mutation off the main thread is a hazard. */
const UI_PROPERTIES = new Set([
  'text',
  'attributedText',
  'image',
  'backgroundColor',
  'textColor',
  'isHidden',
  'alpha',
  'frame',
  'tintColor'
]);

/**
 * True if `call` is a `DispatchQueue.global(...).<something>` call — i.e. its
 * callee chain bottoms out in the identifier `DispatchQueue` followed by a
 * `global` navigation suffix. `DispatchQueue.main...` returns false.
 */
function isDispatchGlobalCall(call: TSNode): boolean {
  // Collect navigation suffixes and the base identifier along the callee chain.
  let base: string | undefined;
  const suffixes: string[] = [];

  const descend = (node: TSNode): void => {
    if (node.type === 'navigation_expression') {
      const suffix = node.childForFieldName('suffix');
      if (suffix) {
        const id = suffix.childForFieldName('suffix');
        if (id) suffixes.push(id.text);
      }
      const target = node.childForFieldName('target');
      if (target) descend(target);
    } else if (node.type === 'call_expression') {
      const callee = node.child(0);
      if (callee) descend(callee);
    } else if (node.type === 'simple_identifier') {
      base = node.text;
    }
  };

  const callee = call.child(0);
  if (callee) descend(callee);

  return base === 'DispatchQueue' && suffixes.includes('global');
}

/**
 * The trailing-closure argument of a call, if present. With a trailing
 * closure tree-sitter places the `lambda_literal` directly inside the
 * `call_suffix`.
 */
function trailingClosure(call: TSNode): TSNode | undefined {
  for (let i = 0; i < call.childCount; i++) {
    const child = call.child(i);
    if (child && child.type === 'call_suffix') {
      for (let j = 0; j < child.childCount; j++) {
        const inner = child.child(j);
        if (inner && inner.type === 'lambda_literal') return inner;
      }
    }
  }
  return undefined;
}

/**
 * Walk `node` and report any assignment to a UI property, but do NOT descend
 * into nested closures: a nested `DispatchQueue.main.async { ... }` correctly
 * re-dispatches to the main thread, and the outer `walk` will visit that
 * nested call on its own (where `main` is excluded). `closureBody` marks the
 * starting closure body so its own statements are still scanned.
 */
function reportUiAssignments(node: TSNode, ctx: RuleContext, isRoot = true): void {
  if (!isRoot && node.type === 'lambda_literal') return;
  if (node.type === 'assignment') {
    const target = node.childForFieldName('target');
    // directly_assignable_expression -> navigation_expression -> suffix id
    if (target) {
      const nav =
        target.type === 'navigation_expression'
          ? target
          : target.child(0)?.type === 'navigation_expression'
            ? target.child(0)
            : undefined;
      if (nav) {
        const suffix = nav.childForFieldName('suffix');
        const id = suffix?.childForFieldName('suffix');
        if (id && UI_PROPERTIES.has(id.text)) {
          if (!ctx.isSuppressed(node.startPosition.row, 'IED-C012')) {
            ctx.report({
              message: `Updating UI property \`${id.text}\` off the main thread; dispatch to DispatchQueue.main / @MainActor.`,
              severity: Severity.Info,
              range: nodeRange(node),
              data: { property: id.text }
            });
          }
        }
      }
    }
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) reportUiAssignments(child, ctx, false);
  }
}

export const mainActorViolationRule: Rule = {
  id: 'IED-C012',
  name: 'main-actor-violation',
  category: 'concurrency',
  severity: Severity.Info,
  languages: ['swift'],
  description: 'UI mutation inside a background DispatchQueue closure.',
  docs: [
    '# main-actor-violation (IED-C012)',
    '',
    'UIKit is not thread-safe. Mutating a view from a background queue races',
    'with the main thread:',
    '',
    '```swift',
    'DispatchQueue.global().async {',
    '    self.label.text = result // flagged',
    '}',
    '```',
    '',
    'Hop back to the main actor before touching the view:',
    '',
    '```swift',
    'DispatchQueue.global().async {',
    '    let result = expensiveWork()',
    '    DispatchQueue.main.async { self.label.text = result }',
    '}',
    '```',
    '',
    'Heuristic: only assignments to a known UI property (`text`, `image`,',
    '`backgroundColor`, ...) inside a `DispatchQueue.global(...)` closure are',
    'flagged. `DispatchQueue.main` closures are ignored.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (node.type === 'call_expression' && isDispatchGlobalCall(node)) {
        const closure = trailingClosure(node);
        if (closure) reportUiAssignments(closure, ctx);
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child);
      }
    };

    walk(ctx.tree.rootNode);
  }
};
