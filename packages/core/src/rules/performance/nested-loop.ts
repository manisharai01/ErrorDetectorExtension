/**
 * IED-P001 — nested-loop
 *
 * Detects O(n^2) work: a loop nested inside another loop. Two cases:
 *
 *   1. Both loops iterate the SAME collection identifier — reported as a likely
 *      quadratic scan that a Map/Set lookup would collapse to O(n).
 *   2. We cannot determine the collection, but the loops are classic
 *      `for (...; i < x.length; ...)` array scans nested >= 2 deep — reported
 *      conservatively as a quadratic hotspot.
 *
 * This is a stateful, depth-tracking walk (queries can't track nesting), modeled
 * on the deep-nesting reference rule. Ported from src/rules/performance/nested-loop.ts.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const LOOP_TYPES = new Set(['for_statement', 'for_in_statement', 'while_statement']);

/**
 * Identifier of the collection a loop iterates, or null if undetermined.
 *
 *   - `for (const x of coll)` / `for (const k in coll)` -> the iterated identifier.
 *     (Tree-sitter parses both as `for_in_statement`.)
 *   - `for (...; i < coll.length; ...)` -> `coll`.
 *   - `while (i < coll.length)` -> `coll`.
 */
function loopCollection(node: TSNode): string | null {
  if (node.type === 'for_in_statement') {
    // Children: for ( <decl/binding> (of|in) <expression> ) body.
    // The iterated expression is the child immediately before the close-paren.
    const right = node.childForFieldName('right');
    if (right) return right.type === 'identifier' ? right.text : null;
    // Fallback for grammars without a "right" field: scan for of/in keyword.
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i);
      if (c && (c.type === 'of' || c.type === 'in')) {
        const next = node.child(i + 1);
        return next && next.type === 'identifier' ? next.text : null;
      }
    }
    return null;
  }

  let condition: TSNode | null = null;
  if (node.type === 'while_statement') {
    condition = node.childForFieldName('condition');
  } else if (node.type === 'for_statement') {
    condition = node.childForFieldName('condition');
  }
  if (condition) return lengthCollectionIn(condition);
  return null;
}

/** Find `coll` in a `... coll.length ...` comparison; null if absent. */
function lengthCollectionIn(node: TSNode): string | null {
  const members = node.descendantsOfType('member_expression');
  for (const m of members) {
    const prop = m.childForFieldName('property');
    const obj = m.childForFieldName('object');
    if (prop && prop.text === 'length' && obj && obj.type === 'identifier') {
      return obj.text;
    }
  }
  return null;
}

/** True when this loop's condition compares against an array `.length`. */
function isLengthScan(node: TSNode): boolean {
  const condition =
    node.type === 'while_statement' || node.type === 'for_statement'
      ? node.childForFieldName('condition')
      : null;
  return condition ? lengthCollectionIn(condition) !== null : false;
}

export const nestedLoopRule: Rule = {
  id: 'IED-P001',
  name: 'nested-loop',
  category: 'performance',
  severity: Severity.Info,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue'],
  description: 'A loop nested inside another loop (potential O(n^2)).',
  docs: [
    '# nested-loop (IED-P001)',
    '',
    'Two loops nested over the same collection are quadratic. A `Set`/`Map`',
    'lookup usually replaces the inner scan with O(1).',
    '',
    '```js',
    'for (const a of items)',
    '  for (const b of items)   // flagged: O(n^2) over "items"',
    '    if (a.id === b.id) ...',
    '```',
    '',
    'When the iterated collection cannot be identified, two nested',
    '`for (...; i < x.length; ...)` array scans are flagged conservatively.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    // Each stack entry is the enclosing loops' collections (string) and whether
    // they were length-scans (for the conservative fallback).
    const collections: Array<string | null> = [];
    let loopDepth = 0;
    let lengthScanDepth = 0;

    const walk = (node: TSNode): void => {
      const isLoop = LOOP_TYPES.has(node.type);
      let pushedCollection = false;
      let countedLengthScan = false;

      if (isLoop) {
        const coll = loopCollection(node);
        const lengthScan = isLengthScan(node);

        if (loopDepth > 0 && !ctx.isSuppressed(node.startPosition.row, 'IED-P001')) {
          if (coll && collections.includes(coll)) {
            // Strongest signal: the inner loop iterates the same collection as
            // an enclosing loop.
            ctx.report({
              message: `Nested iteration over "${coll}" is O(n^2) — consider a Map/Set for lookups.`,
              severity: Severity.Info,
              range: nodeRange(node),
              data: { collection: coll, kind: 'same-collection' }
            });
          } else if (lengthScan && lengthScanDepth >= 1) {
            // Conservative fallback: two classic `for (...; i < x.length; ...)`
            // array scans nested >= 2 deep, even when the collections differ or
            // can't be identified as the same one.
            ctx.report({
              message:
                'Nested array scans (inner loop over a `.length` range inside another) — likely O(n^2).',
              severity: Severity.Info,
              range: nodeRange(node),
              data: { kind: 'length-scan' }
            });
          }
        }

        collections.push(coll);
        pushedCollection = true;
        loopDepth++;
        if (lengthScan) {
          lengthScanDepth++;
          countedLengthScan = true;
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child);
      }

      if (pushedCollection) {
        collections.pop();
        loopDepth--;
      }
      if (countedLengthScan) lengthScanDepth--;
    };

    walk(ctx.tree.rootNode);
  }
};
