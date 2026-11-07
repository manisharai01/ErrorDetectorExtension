/**
 * IED-L024 — empty-catch (Dart)
 *
 * A `catch` / `on T` handler with an empty body silently swallows the error:
 * no logging, no rethrow, no recovery. In Flutter this typically hides a
 * failed network call behind a spinner that never stops.
 *
 * Grammar shape: a handler's body is NOT inside the `catch_clause`; it is the
 * `block` sibling that follows it (or follows the `on` type when there is no
 * `catch`). So every `block` child of a `try_statement` other than the `body`
 * field is a handler body (the `finally` block sits inside `finally_clause`).
 * A block with a comment in it counts as deliberately empty and is not flagged.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext
} from '../types';

export const dartEmptyCatchRule: Rule = {
  id: 'IED-L024',
  name: 'empty-catch',
  category: 'logic',
  severity: Severity.Warning,
  languages: ['dart'],
  description: 'Empty catch / on handler silently swallows the error.',
  docs: [
    '# empty-catch (IED-L024)',
    '',
    'An empty handler discards the error, so failures become invisible.',
    '',
    '```dart',
    'try { await api.save(); } catch (e) { }          // flagged',
    'try { await api.save(); } on SocketException { } // flagged',
    'try { await api.save(); } catch (e, st) { log(e.toString(), stackTrace: st); } // ok',
    '```',
    '',
    'At minimum log the error, or rethrow if it cannot be handled here. A',
    'comment inside the block marks an intentionally ignored error.'
  ].join('\n'),

  nodeTypes: () => ['try_statement'],

  run(ctx: RuleContext): void {
    for (const tryStmt of ctx.nodesOfType('try_statement')) {
      const body = tryStmt.childForFieldName('body');
      for (let i = 0; i < tryStmt.childCount; i++) {
        const block = tryStmt.child(i);
        if (!block || block.type !== 'block') continue;
        if (body && block.startIndex === body.startIndex) continue;
        if (block.namedChildCount > 0) continue;
        // Anchor on the handler head: the `catch_clause`, or the `on` keyword.
        let head = block.previousSibling;
        while (head && head.type !== 'catch_clause' && head.type !== 'on') head = head.previousSibling;
        const anchor = head ?? block;
        if (ctx.isSuppressed(anchor.startPosition.row, 'IED-L024')) continue;
        ctx.report({
          message: 'Empty catch block swallows the error — log it, handle it, or rethrow.',
          severity: Severity.Warning,
          range: nodeRange(anchor)
        });
      }
    }
  }
};
