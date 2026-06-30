/**
 * IED-Q003 — magic-numbers
 *
 * Flags numeric literals other than the common ones {0,1,-1,2,100} that are not
 * the initializer of a `const` declaration. Numbers used purely as an array
 * subscript index are skipped. Each offending number is reported individually.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';
import { profileFor } from '../../engine/grammar-profile';

/** Values considered "not magic" and therefore allowed anywhere. */
const ALLOWED = new Set(['0', '1', '-1', '2', '100']);

/**
 * Resolve the literal text for a `number` node, folding a leading unary minus
 * so that `-1` is recognised as allowed.
 */
function numericText(node: TSNode): string {
  const parent = node.parent;
  if (parent && parent.type === 'unary_expression') {
    const op = parent.child(0);
    if (op && op.text === '-') return `-${node.text}`;
  }
  return node.text;
}

/** Same node identity, compared by source span (unambiguous within one tree). */
function sameNode(a: TSNode | null | undefined, b: TSNode): boolean {
  if (!a) return false;
  return (
    a.startPosition.row === b.startPosition.row &&
    a.startPosition.column === b.startPosition.column &&
    a.endPosition.row === b.endPosition.row &&
    a.endPosition.column === b.endPosition.column &&
    a.type === b.type
  );
}

/**
 * True when `node` is the value of a `const` variable_declarator, i.e. the
 * declaration is already naming the constant.
 */
function isConstInitializer(node: TSNode): boolean {
  // The number may be wrapped in a unary_expression (e.g. `-5`); climb past it.
  let valueNode = node;
  const parent = node.parent;
  if (parent && parent.type === 'unary_expression') valueNode = parent;

  const declarator = valueNode.parent;
  if (!declarator || declarator.type !== 'variable_declarator') return false;
  if (!sameNode(declarator.childForFieldName('value'), valueNode)) return false;

  const lexical = declarator.parent;
  if (!lexical || lexical.type !== 'lexical_declaration') return false;
  // lexical_declaration starts with the `const`/`let` keyword.
  return lexical.child(0)?.text === 'const';
}

/** True when `node` is the index of a subscript_expression (e.g. `arr[3]`). */
function isArrayIndex(node: TSNode): boolean {
  const parent = node.parent;
  if (!parent || parent.type !== 'subscript_expression') return false;
  return sameNode(parent.childForFieldName('index'), node);
}

export const magicNumbersRule: Rule = {
  id: 'IED-Q003',
  name: 'magic-numbers',
  category: 'quality',
  severity: Severity.Info,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue', 'python', 'go', 'rust', 'java', 'kotlin'],
  description: 'Numeric literals used inline instead of a named constant.',
  docs: [
    '# magic-numbers (IED-Q003)',
    '',
    'Numeric literals other than 0, 1, -1, 2 and 100 are easier to understand',
    'when extracted to a named constant. Numbers that are themselves the value',
    'of a `const` declaration, or that are used as an array index, are ignored.',
    '',
    '```js',
    'setTimeout(fn, 86400000); // flagged — name it ONE_DAY_MS',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    // Numeric-literal node types differ per grammar (JS `number`, Python
    // `integer`/`float`, Go `int_literal`/`float_literal`). The const/array-index
    // exemptions below are JS-shaped; on Python/Go their node-type guards simply
    // don't match, so those literals are reported (which is correct — they are
    // magic numbers there too).
    const numberNodes = new Set(profileFor(ctx.language).numberNodes);
    const walk = (node: TSNode): void => {
      if (numberNodes.has(node.type)) {
        if (
          !ALLOWED.has(numericText(node)) &&
          !isConstInitializer(node) &&
          !isArrayIndex(node) &&
          !ctx.isSuppressed(node.startPosition.row, 'IED-Q003')
        ) {
          ctx.report({
            message: `Magic number ${node.text} — extract it to a named constant.`,
            severity: Severity.Info,
            range: nodeRange(node),
            data: { value: node.text }
          });
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
