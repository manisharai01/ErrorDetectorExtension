/**
 * IED-Q005 — todo-without-issue
 *
 * Flags TODO/FIXME/HACK/XXX comments that lack an issue tracker reference such
 * as `#123` or `JIRA-456`. Walks the tree for `comment` nodes.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';
import { profileFor } from '../../engine/grammar-profile';

const MARKER = /\b(TODO|FIXME|HACK|XXX)\b/;
/** An issue reference: `#123` or a ticket id like `ABC-123`. */
const ISSUE_REF = /#\d+|[A-Z]+-\d+/;

export const todoWithoutIssueRule: Rule = {
  id: 'IED-Q005',
  name: 'todo-without-issue',
  category: 'quality',
  severity: Severity.Info,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue', 'python', 'go', 'rust', 'java', 'kotlin', 'swift', 'c', 'cpp', 'php'],
  description: 'TODO/FIXME comment without an issue tracker reference.',
  docs: [
    '# todo-without-issue (IED-Q005)',
    '',
    'A `TODO`, `FIXME`, `HACK` or `XXX` comment should point at a tracked issue',
    '(`#123` or `JIRA-456`) so the work is not silently forgotten.',
    '',
    '```js',
    '// TODO fix the retry logic        <- flagged',
    '// TODO(#812) fix the retry logic  <- ok',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const commentNodes = new Set(profileFor(ctx.language).commentNodes);
    const walk = (node: TSNode): void => {
      if (commentNodes.has(node.type)) {
        const text = node.text;
        if (MARKER.test(text) && !ISSUE_REF.test(text)) {
          if (!ctx.isSuppressed(node.startPosition.row, 'IED-Q005')) {
            const marker = MARKER.exec(text)?.[1] ?? 'TODO';
            ctx.report({
              message: `${marker} comment without an issue reference (e.g. #123 or ABC-123).`,
              severity: Severity.Info,
              range: nodeRange(node),
              data: { marker }
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
