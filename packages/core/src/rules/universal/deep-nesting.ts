/**
 * IED-Q004 — deep-nesting
 *
 * Flags statements nested deeper than `threshold` (default 4) control-flow
 * levels. The nesting nodes come from the shared index in document order; a
 * stack of the currently-open ones (by source span) gives each node's depth
 * without walking the whole tree.
 */

import {
  ALL_LANGUAGES,
  Severity,
  nodeRange,
  type Rule,
  type RuleContext
} from '../types';
import { profileFor } from '../../engine/grammar-profile';

const DEFAULT_THRESHOLD = 4;

export const deepNestingRule: Rule = {
  id: 'IED-Q004',
  name: 'deep-nesting',
  category: 'quality',
  severity: Severity.Info,
  languages: ALL_LANGUAGES,
  description: 'Control-flow nesting deeper than the configured maximum.',
  docs: [
    '# deep-nesting (IED-Q004)',
    '',
    'Deeply nested control flow is hard to read and test. Default max depth 4;',
    'configure with `{ "options": { "threshold": 5 } }`.'
  ].join('\n'),

  nodeTypes: (language) => profileFor(language).nestingNodes,

  run(ctx: RuleContext): void {
    const threshold =
      typeof ctx.config.threshold === 'number' ? ctx.config.threshold : DEFAULT_THRESHOLD;

    // Spans of the nesting nodes that enclose the current one (pre-order, so an
    // ancestor is always seen before its descendants).
    const open: Array<{ start: number; end: number }> = [];
    for (const node of ctx.nodesOfType(profileFor(ctx.language).nestingNodes)) {
      const start = node.startIndex;
      const end = node.endIndex;
      while (open.length > 0) {
        const top = open[open.length - 1];
        if (top.start <= start && end <= top.end) break;
        open.pop();
      }
      open.push({ start, end });
      const depth = open.length;
      if (depth <= threshold) continue;
      if (ctx.isSuppressed(node.startPosition.row, 'IED-Q004')) continue;
      ctx.report({
        message: `Nesting depth ${depth} exceeds maximum of ${threshold}.`,
        severity: Severity.Info,
        range: nodeRange(node),
        data: { depth, threshold }
      });
    }
  }
};
