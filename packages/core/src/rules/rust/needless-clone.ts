/**
 * IED-P009 — needless-clone
 *
 * Flags `x.clone()` calls so the author can confirm the clone is necessary.
 * Without type information we can't prove a type is `Copy`, so this is an
 * Info-level nudge (not an error) and is conservative: it only fires on a
 * `.clone()` method call whose receiver is a plain identifier (`x.clone()`),
 * the form most often redundant on `Copy` types. Relaxed in test code.
 */
import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

export const needlessCloneRule: Rule = {
  id: 'IED-P009',
  name: 'needless-clone',
  category: 'performance',
  severity: Severity.Info,
  languages: ['rust'],
  description: 'A `.clone()` call that may be unnecessary (Copy types do not need it).',
  docs: [
    '# needless-clone (IED-P009)',
    '',
    'Cloning a value that is `Copy` (or that could be borrowed) is wasted work.',
    'This flags `x.clone()` for review — if the receiver is `Copy`, drop the',
    '`.clone()`; if you need a borrow, use `&x` instead.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    if (ctx.isTestFile) return;

    const walk = (node: TSNode): void => {
      if (node.type === 'call_expression') {
        const fn = node.childForFieldName('function');
        if (fn && fn.type === 'field_expression') {
          const field = fn.childForFieldName('field');
          const receiver = fn.childForFieldName('value');
          const args = node.childForFieldName('arguments');
          const argCount = args ? args.namedChildCount : 0;
          if (
            field &&
            field.text === 'clone' &&
            argCount === 0 &&
            receiver &&
            receiver.type === 'identifier' &&
            !ctx.isSuppressed(node.startPosition.row, 'IED-P009')
          ) {
            ctx.report({
              message: `\`${receiver.text}.clone()\` may be unnecessary — drop it if the type is Copy, or borrow with &.`,
              severity: Severity.Info,
              range: nodeRange(node),
              data: { receiver: receiver.text }
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
