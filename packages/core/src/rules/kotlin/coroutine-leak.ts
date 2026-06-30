/**
 * IED-C011 — coroutine-leak (Kotlin)
 *
 * Coroutines launched on `GlobalScope` outlive any structured concurrency
 * scope: they are not cancelled when the surrounding component (a ViewModel,
 * an Activity, a request handler) is torn down, so they leak work, memory, and
 * sometimes crash on a dead UI. `GlobalScope.launch { … }` / `GlobalScope.async
 * { … }` is the canonical Kotlin coroutine leak.
 *
 * NODE SHAPE (verified):
 *   GlobalScope.launch { … } ->
 *     (call_expression
 *       (navigation_expression
 *         (simple_identifier)            // operand: "GlobalScope"
 *         (navigation_suffix (simple_identifier)))  // ".launch" / ".async"
 *       (call_suffix …))
 *
 * Conservative scope: we ONLY flag the literal `GlobalScope.launch` /
 * `GlobalScope.async` receiver. A bare `launch`/`async` inside an arbitrary
 * lambda cannot be proven unstructured without type information, so we do not
 * flag it — this keeps false positives at zero.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const COROUTINE_BUILDERS = new Set(['launch', 'async']);

/** The receiver `simple_identifier` of a `navigation_expression`, if direct. */
function operandIdentifier(nav: TSNode): TSNode | undefined {
  const operand = nav.child(0);
  return operand && operand.type === 'simple_identifier' ? operand : undefined;
}

/** The trailing member name of a `navigation_expression`'s `navigation_suffix`. */
function suffixName(nav: TSNode): TSNode | undefined {
  for (let i = 0; i < nav.childCount; i++) {
    const child = nav.child(i);
    if (child && child.type === 'navigation_suffix') {
      for (let j = 0; j < child.childCount; j++) {
        const c = child.child(j);
        if (c && c.type === 'simple_identifier') return c;
      }
    }
  }
  return undefined;
}

export const coroutineLeakRule: Rule = {
  id: 'IED-C011',
  name: 'coroutine-leak',
  category: 'concurrency',
  severity: Severity.Warning,
  languages: ['kotlin'],
  description: 'Coroutine launched on GlobalScope (unstructured, leaks).',
  docs: [
    '# coroutine-leak (IED-C011)',
    '',
    'Coroutines started on `GlobalScope` are not bound to any lifecycle and are',
    'never cancelled automatically — they leak:',
    '',
    '```kotlin',
    'GlobalScope.launch { fetch() } // flagged',
    '```',
    '',
    'Launch from a structured `CoroutineScope` tied to the component lifecycle',
    '(`viewModelScope`, `lifecycleScope`, or an injected `CoroutineScope`):',
    '',
    '```kotlin',
    'viewModelScope.launch { fetch() }',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (node.type === 'call_expression') {
        const callee = node.child(0);
        if (callee && callee.type === 'navigation_expression') {
          const receiver = operandIdentifier(callee);
          const member = suffixName(callee);
          if (
            receiver &&
            receiver.text === 'GlobalScope' &&
            member &&
            COROUTINE_BUILDERS.has(member.text) &&
            !ctx.isSuppressed(node.startPosition.row, 'IED-C011')
          ) {
            ctx.report({
              message:
                'GlobalScope coroutine leaks; launch from a structured CoroutineScope.',
              severity: Severity.Warning,
              range: nodeRange(node),
              data: { builder: member.text }
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
