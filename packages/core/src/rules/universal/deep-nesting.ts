/**
 * IED-Q004 — deep-nesting
 *
 * Flags statements nested deeper than `threshold` (default 4) control-flow
 * levels. This is a stateful, depth-tracking walk — Tree-sitter queries are
 * stateless and cannot count nesting, so we walk the tree manually using the
 * node cursor. This is the reference pattern for "walk, don't query" rules.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';
import { profileFor } from '../../engine/grammar-profile';

const DEFAULT_THRESHOLD = 4;

export const deepNestingRule: Rule = {
  id: 'IED-Q004',
  name: 'deep-nesting',
  category: 'quality',
  severity: Severity.Info,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue', 'python', 'go', 'rust', 'java', 'kotlin', 'swift', 'c', 'cpp', 'php'],
  description: 'Control-flow nesting deeper than the configured maximum.',
  docs: [
    '# deep-nesting (IED-Q004)',
    '',
    'Deeply nested control flow is hard to read and test. Default max depth 4;',
    'configure with `{ "options": { "threshold": 5 } }`.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const threshold =
      typeof ctx.config.threshold === 'number' ? ctx.config.threshold : DEFAULT_THRESHOLD;
    const nestingTypes = new Set(profileFor(ctx.language).nestingNodes);

    const walk = (node: TSNode, depth: number): void => {
      const isNesting = nestingTypes.has(node.type);
      const next = isNesting ? depth + 1 : depth;
      if (isNesting && next > threshold) {
        if (!ctx.isSuppressed(node.startPosition.row, 'IED-Q004')) {
          ctx.report({
            message: `Nesting depth ${next} exceeds maximum of ${threshold}.`,
            severity: Severity.Info,
            range: nodeRange(node),
            data: { depth: next, threshold }
          });
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child, next);
      }
    };

    walk(ctx.tree.rootNode, 0);
  }
};
