/**
 * Vue framework rule (ported from src/rules/framework-specific/vue.ts).
 *
 *   IED-F005 ref-misuse — reassigning a `ref()` binding instead of its `.value`
 *
 * Two-pass walk: first collect the names bound to `ref(...)` calls, then flag
 * any `x = ...` assignment whose left-hand side is a bare ref identifier (the
 * correct form is `x.value = ...`).
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

/** Walk every descendant of `root`, calling `fn` on each node. */
function walkAll(root: TSNode, fn: (n: TSNode) => void): void {
  fn(root);
  for (let i = 0; i < root.childCount; i++) {
    const child = root.child(i);
    if (child) walkAll(child, fn);
  }
}

/** The simple callee name of a call_expression (`ref(...)` -> "ref"), or null. */
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

export const vueRefMisuseRule: Rule = {
  id: 'IED-F005',
  name: 'ref-misuse',
  category: 'framework',
  severity: Severity.Warning,
  languages: ['javascript', 'typescript', 'vue'],
  description: 'Reassigning a Vue ref instead of its .value.',
  docs: [
    '# ref-misuse (IED-F005)',
    '',
    'A `ref()` from the Composition API holds its value under `.value`.',
    'Reassigning the binding itself (`count = 5`) replaces the ref and breaks',
    'reactivity — assign to `count.value` instead.',
    '',
    '```ts',
    'const count = ref(0);',
    'count = 5;        // flagged',
    'count.value = 5;  // ok',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    // Pass 1: collect `const x = ref(...)` binding names.
    const refs = new Set<string>();
    walkAll(ctx.tree.rootNode, (n) => {
      if (n.type !== 'variable_declarator') return;
      const nameNode = n.childForFieldName('name');
      const value = n.childForFieldName('value');
      if (!nameNode || nameNode.type !== 'identifier') return;
      if (!value || value.type !== 'call_expression') return;
      if (calleeName(value) !== 'ref') return;
      refs.add(nameNode.text);
    });
    if (refs.size === 0) return;

    // Pass 2: flag bare reassignments `x = ...` (but not `x.value = ...`).
    walkAll(ctx.tree.rootNode, (n) => {
      if (n.type !== 'assignment_expression') return;
      const left = n.childForFieldName('left');
      if (!left || left.type !== 'identifier') return;
      if (!refs.has(left.text)) return;
      if (ctx.isSuppressed(n.startPosition.row, 'IED-F005')) return;
      ctx.report({
        message: `Reassigning ref "${left.text}" replaces the ref — assign to ${left.text}.value instead.`,
        severity: Severity.Warning,
        range: nodeRange(n),
        data: { ref: left.text }
      });
    });
  }
};
