/**
 * IED-Q002 — commented-code
 *
 * Flags a run of >=3 consecutive comment lines whose stripped text looks like
 * code (contains `;`, `{`, `}`, `=>`, or a code keyword). Reads the comment
 * nodes from the index, groups consecutive single-line comments, and reports on
 * the first comment of a qualifying run.
 */

import {
  ALL_LANGUAGES,
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';
import { profileFor } from '../../engine/grammar-profile';

const MIN_RUN = 3;

/** Strip leading comment markers (line/block comment openers and the trailing close). */
function stripComment(text: string): string {
  return text
    .replace(/^\s*\/\//, '')
    .replace(/^\s*\/\*+/, '')
    .replace(/\*+\/\s*$/, '')
    .replace(/^\s*\*+/, '')
    .trim();
}

/** Heuristic: does this stripped comment text resemble source code? */
function looksLikeCode(s: string): boolean {
  if (!s) return false;
  if (s.includes(';') || s.includes('{') || s.includes('}') || s.includes('=>')) return true;
  return /\b(if|for|while|return|function|const|let|var)\b/.test(s);
}

export const commentedCodeRule: Rule = {
  id: 'IED-Q002',
  name: 'commented-code',
  category: 'quality',
  severity: Severity.Info,
  languages: ALL_LANGUAGES,
  description: 'A block of consecutive commented-out lines that resemble code.',
  docs: [
    '# commented-code (IED-Q002)',
    '',
    'Three or more consecutive comment lines that look like code (contain `;`,',
    '`{`, `}`, `=>`, or a keyword such as `if`/`for`/`return`) are usually dead',
    'code left behind. Delete it; version control already remembers it.',
    '',
    '```js',
    '// const x = compute();',
    '// if (x) {',
    '//   doThing(x);',
    '// }',
    '```'
  ].join('\n'),

  nodeTypes: (language) => profileFor(language).commentNodes,

  run(ctx: RuleContext): void {
    // All comment nodes, in document order.
    const comments = ctx.nodesOfType(profileFor(ctx.language).commentNodes);

    // Group comments into runs of consecutive lines that look like code.
    let runStart: TSNode | null = null;
    let runCount = 0;
    let prevRow = -2;

    const flush = (): void => {
      if (runStart && runCount >= MIN_RUN) {
        if (!ctx.isSuppressed(runStart.startPosition.row, 'IED-Q002')) {
          ctx.report({
            message: `Block of ${runCount} commented-out lines that resemble code; delete it.`,
            severity: Severity.Info,
            range: nodeRange(runStart),
            data: { lines: runCount }
          });
        }
      }
      runStart = null;
      runCount = 0;
    };

    for (const c of comments) {
      const codey = looksLikeCode(stripComment(c.text));
      const consecutive = c.startPosition.row === prevRow + 1;
      if (codey) {
        if (!runStart || !consecutive) {
          // Starting a new run (either first, or a gap broke the previous one).
          flush();
          runStart = c;
          runCount = 1;
        } else {
          runCount++;
        }
      } else {
        flush();
      }
      prevRow = c.endPosition.row;
    }
    flush();
  }
};
