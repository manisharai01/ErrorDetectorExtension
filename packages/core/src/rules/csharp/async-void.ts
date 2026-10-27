/**
 * IED-C013 — async-void (C#)
 *
 * `async void` methods cannot be awaited, and any exception they throw is
 * raised on the synchronization context rather than propagating to a caller —
 * so it is typically unhandled and crashes the process. The only legitimate
 * use is an event handler. This rule flags a `method_declaration` that has an
 * `async` modifier and a `void` return type.
 *
 * Structure: `(method_declaration (modifier) ... type: (void_keyword) name: ...)`
 * where a `modifier` child's text is `async`.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

export const asyncVoidRule: Rule = {
  id: 'IED-C013',
  name: 'async-void',
  category: 'concurrency',
  severity: Severity.Warning,
  languages: ['csharp'],
  description: 'Flags `async void` methods, which cannot be awaited and swallow exceptions.',
  docs: [
    '# async-void (IED-C013)',
    '',
    '`async void` methods cannot be awaited, so callers cannot know when they',
    'finish, and their exceptions escape to the synchronization context instead',
    'of the caller — usually crashing the app.',
    '',
    '```csharp',
    'public async void DoWork() { await Task.Delay(1); } // flagged',
    'public async Task DoWork() { await Task.Delay(1); }  // ok',
    '```',
    '',
    'Return `Task` instead. `async void` is only appropriate for event handlers.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (node.type === 'method_declaration') {
        let isAsync = false;
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child && child.type === 'modifier' && child.text === 'async') {
            isAsync = true;
            break;
          }
        }
        const type = node.childForFieldName('type');
        const returnsVoid = type?.type === 'void_keyword';
        if (isAsync && returnsVoid) {
          const name = node.childForFieldName('name');
          const target = name ?? node;
          if (!ctx.isSuppressed(node.startPosition.row, 'IED-C013')) {
            ctx.report({
              message: 'Avoid `async void`; return `Task` so the method can be awaited and its exceptions observed.',
              severity: Severity.Warning,
              range: nodeRange(target)
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
