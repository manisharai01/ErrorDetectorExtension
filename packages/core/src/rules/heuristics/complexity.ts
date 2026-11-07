/**
 * IED-H001 — cognitive-complexity
 *
 * SonarSource-inspired cognitive complexity. For each function we add:
 *   +1 (plus the current nesting level) for each control-flow construct
 *      (if/for/for-in/while/do/catch/ternary/switch), and
 *   +1 for each `&&` / `||` boolean operator.
 * Each control-flow construct also increases the nesting level for everything
 * inside it, and nested functions are scored on their own. If the total exceeds
 * `threshold` (default 15) we report on the function.
 *
 * One pass over the indexed functions + constructs (document order): a stack of
 * the enclosing spans tells each construct which function it belongs to and how
 * deeply it is nested there.
 */

import {
  ALL_LANGUAGES,
  Severity,
  nodeRange,
  type Language,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';
import { profileFor } from '../../engine/grammar-profile';
import { encloses, functionNameNode, type Span } from '../util';

const DEFAULT_THRESHOLD = 15;

/** Binary-expression node types whose operator may be `&&`/`||` (Ruby: `binary`). */
const BINARY_TYPES = ['binary_expression', 'binary'];

function indexedTypes(language: Language): string[] {
  const p = profileFor(language);
  return [
    ...p.functionNodes,
    ...p.complexityNodes,
    ...p.booleanOpNodes,
    ...(p.logicalOperators.length > 0 ? BINARY_TYPES : [])
  ];
}

interface FunctionScore {
  node: TSNode;
  score: number;
}

type Frame = Span & { fn?: FunctionScore };

/** Human-readable name + the node to anchor the report on. */
function functionLabel(fnNode: TSNode): { name: string; anchor: TSNode } {
  const nameNode = functionNameNode(fnNode);
  if (nameNode) return { name: nameNode.text, anchor: nameNode };
  // Arrow / anonymous function expression: anchor on the function node itself.
  return { name: '<anonymous>', anchor: fnNode };
}

export const cognitiveComplexityRule: Rule = {
  id: 'IED-H001',
  name: 'cognitive-complexity',
  category: 'quality',
  severity: Severity.Info,
  languages: ALL_LANGUAGES,
  description: 'Function with high cognitive complexity (nested control flow, boolean chains).',
  docs: [
    '# cognitive-complexity (IED-H001)',
    '',
    'Cognitive complexity measures how hard a function is to follow: each branch',
    'adds 1, nested branches add more, and `&&`/`||` chains add 1 each. Above the',
    'threshold (default 15) the function is hard to read and test.',
    '',
    'Configure with `{ "options": { "threshold": 20 } }`. Extract guard clauses,',
    'split nested branches into helpers, or invert if/else to flatten.'
  ].join('\n'),

  nodeTypes: indexedTypes,

  run(ctx: RuleContext): void {
    const threshold =
      typeof ctx.config.threshold === 'number' ? ctx.config.threshold : DEFAULT_THRESHOLD;
    const profile = profileFor(ctx.language);
    const functionTypes = new Set(profile.functionNodes);
    const incrementTypes = new Set(profile.complexityNodes);
    const booleanOpNodes = new Set(profile.booleanOpNodes);
    const logicalOps = new Set(profile.logicalOperators);

    const functions: FunctionScore[] = [];
    // Enclosing functions and control-flow constructs of the current node.
    const stack: Frame[] = [];

    for (const node of ctx.nodesOfType(indexedTypes(ctx.language))) {
      const span: Span = { start: node.startIndex, end: node.endIndex };
      while (stack.length > 0 && !encloses(stack[stack.length - 1], span)) stack.pop();

      const type = node.type;
      if (functionTypes.has(type)) {
        const fn: FunctionScore = { node, score: 0 };
        functions.push(fn);
        stack.push({ ...span, fn });
        continue;
      }

      // The innermost enclosing function, and how many constructs sit between
      // it and this node (the nesting level). Top-level code is not scored.
      let depth = 0;
      let owner: FunctionScore | undefined;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].fn) {
          owner = stack[i].fn;
          break;
        }
        depth++;
      }

      if (incrementTypes.has(type)) {
        if (owner) owner.score += 1 + depth;
        stack.push(span);
      } else if (booleanOpNodes.has(type)) {
        // Python: `a and b` is a `boolean_operator` node.
        if (owner) owner.score += 1;
      } else if (owner) {
        // JS/Go/C#: `&&` / `||` on a `binary_expression`; Ruby uses `binary`
        // (also `and`/`or`). Only the logical operators in the profile count, so
        // arithmetic/comparison binaries are ignored.
        const op = node.childForFieldName('operator')?.text;
        if (op && logicalOps.has(op)) owner.score += 1;
      }
    }

    for (const { node, score } of functions) {
      if (score <= threshold) continue;
      const { name, anchor } = functionLabel(node);
      if (ctx.isSuppressed(anchor.startPosition.row, 'IED-H001')) continue;
      ctx.report({
        message: `Function "${name}" has cognitive complexity ${score} (threshold ${threshold}).`,
        severity: Severity.Info,
        range: nodeRange(anchor),
        data: { name, score, threshold }
      });
    }
  }
};
