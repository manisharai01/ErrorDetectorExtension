/**
 * IED-Q007 — duplicate-code
 *
 * Detects near-identical function bodies within a single file. For each function
 * body we take the sequence of descendant node types (structural shape,
 * ignoring identifier names and literal values), hash it, and report the second
 * function that shares an identical hash with an earlier one — provided the
 * structural sequence is long enough (>= 20 nodes) to be meaningful.
 *
 * Works in every language (function node types come from the grammar profile).
 * The structural hash is exposed as `data.hash`; the project-level
 * `findDuplicateFunctions` uses the same signature to find copies ACROSS files.
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
import { functionBody, structuralSignature } from '../util';

const MIN_SEQUENCE = 20;

export const duplicateCodeRule: Rule = {
  id: 'IED-Q007',
  name: 'duplicate-code',
  category: 'quality',
  severity: Severity.Info,
  languages: ALL_LANGUAGES,
  description: 'Two functions in this file have structurally identical bodies.',
  docs: [
    '# duplicate-code (IED-Q007)',
    '',
    'Two functions in the same file have the same structural shape (identical',
    'sequence of syntax-node types — names and literal values are ignored, so a',
    'copy-pasted function with renamed variables still matches). Consider',
    'extracting the shared logic into a single reusable helper.',
    '',
    'Only bodies with at least 20 syntax nodes are compared, to avoid flagging',
    'trivial one-liners. `ied duplicates` finds the same pattern across files.'
  ].join('\n'),

  nodeTypes: (language) => profileFor(language).functionNodes,

  run(ctx: RuleContext): void {
    // First function (in document order) seen for each structural hash.
    const firstByHash = new Map<number, TSNode>();

    for (const node of ctx.nodesOfType(profileFor(ctx.language).functionNodes)) {
      const { hash, size } = structuralSignature(functionBody(node));
      if (size < MIN_SEQUENCE) continue;
      const first = firstByHash.get(hash);
      if (first === undefined) {
        firstByHash.set(hash, node);
        continue;
      }
      if (ctx.isSuppressed(node.startPosition.row, 'IED-Q007')) continue;
      ctx.report({
        message:
          'Duplicate function body — structurally identical to an earlier ' +
          `function (line ${first.startPosition.row + 1}). Extract a shared helper.`,
        severity: Severity.Info,
        range: nodeRange(node),
        related: [
          {
            message: 'First occurrence of this structure.',
            range: nodeRange(first)
          }
        ],
        data: { firstLine: first.startPosition.row + 1, nodes: size, hash }
      });
    }
  }
};
