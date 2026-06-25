/**
 * IED-Q007 — duplicate-code
 *
 * Detects near-identical function bodies within a single file. For each function
 * body we build the sequence of descendant node `.type` strings (structural
 * shape, ignoring identifiers/literals), hash it with djb2, and report the
 * second function that shares an identical hash with an earlier one — provided
 * the structural sequence is long enough (>= 20 nodes) to be meaningful.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const MIN_SEQUENCE = 20;

const FUNCTION_TYPES = new Set([
  'function_declaration',
  'arrow_function',
  'function_expression',
  'method_definition'
]);

/** Walk a body node and collect every descendant node type, in order. */
function typeSequence(body: TSNode): string[] {
  const seq: string[] = [];
  const walk = (node: TSNode): void => {
    seq.push(node.type);
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child);
    }
  };
  walk(body);
  return seq;
}

/** djb2 string hash over the joined type sequence. */
function djb2(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0; // force unsigned 32-bit
}

export const duplicateCodeRule: Rule = {
  id: 'IED-Q007',
  name: 'duplicate-code',
  category: 'quality',
  severity: Severity.Info,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue'],
  description: 'Two functions in this file have structurally identical bodies.',
  docs: [
    '# duplicate-code (IED-Q007)',
    '',
    'Two functions in the same file have the same structural shape (identical',
    'sequence of syntax-node types). Consider extracting the shared logic into a',
    'single reusable helper.',
    '',
    'Only bodies with at least 20 syntax nodes are compared, to avoid flagging',
    'trivial one-liners.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    // First function (in document order) seen for each structural hash.
    const firstByHash = new Map<number, TSNode>();

    const walk = (node: TSNode): void => {
      if (FUNCTION_TYPES.has(node.type)) {
        const body = node.childForFieldName('body');
        if (body) {
          const seq = typeSequence(body);
          if (seq.length >= MIN_SEQUENCE) {
            const hash = djb2(seq.join(','));
            const first = firstByHash.get(hash);
            if (first === undefined) {
              firstByHash.set(hash, node);
            } else if (!ctx.isSuppressed(node.startPosition.row, 'IED-Q007')) {
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
                data: { firstLine: first.startPosition.row + 1, nodes: seq.length }
              });
            }
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
