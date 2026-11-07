/**
 * IED-Q005 — todo-without-issue
 *
 * Flags TODO/FIXME/HACK/XXX comments that lack an issue tracker reference such
 * as `#123` or `JIRA-456`. Reads the language's comment nodes from the index.
 */

import {
  ALL_LANGUAGES,
  Severity,
  nodeRange,
  type Rule,
  type RuleContext
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
  languages: ALL_LANGUAGES,
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

  nodeTypes: (language) => profileFor(language).commentNodes,

  run(ctx: RuleContext): void {
    for (const node of ctx.nodesOfType(profileFor(ctx.language).commentNodes)) {
      const text = node.text;
      if (!MARKER.test(text) || ISSUE_REF.test(text)) continue;
      if (ctx.isSuppressed(node.startPosition.row, 'IED-Q005')) continue;
      const marker = MARKER.exec(text)?.[1] ?? 'TODO';
      ctx.report({
        message: `${marker} comment without an issue reference (e.g. #123 or ABC-123).`,
        severity: Severity.Info,
        range: nodeRange(node),
        data: { marker }
      });
    }
  }
};
