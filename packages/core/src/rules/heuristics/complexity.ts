/**
 * IED-H001 — cognitive-complexity
 *
 * SonarSource-inspired cognitive complexity. For each function we walk its body
 * and add:
 *   +1 (plus the current nesting level) for each control-flow construct
 *      (if/for/for-in/while/do/catch/ternary/switch), and
 *   +1 for each `&&` / `||` boolean operator.
 * Each control-flow construct also increases the nesting level for everything
 * inside it. If the total exceeds `threshold` (default 15) we report on the
 * function. Walk-based, modeled on the deep-nesting reference rule. Ported from
 * src/rules/heuristics/complexity-and-naming.ts.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';
import { profileFor, type GrammarProfile } from '../../engine/grammar-profile';

const DEFAULT_THRESHOLD = 15;

/**
 * Score the cognitive complexity of a function body. `node` is the function
 * node; we score its descendants but do NOT descend into nested function bodies
 * (those get their own score / their own report). Node types are taken from the
 * language's grammar profile so this works across JS/TS, Python, and Go.
 */
function scoreFunction(fnNode: TSNode, profile: GrammarProfile): number {
  let score = 0;
  const functionTypes = new Set(profile.functionNodes);
  const incrementTypes = new Set(profile.complexityNodes);
  const booleanOpNodes = new Set(profile.booleanOpNodes);
  const logicalOps = new Set(profile.logicalOperators);

  const visit = (node: TSNode, depth: number, root: boolean): void => {
    // Don't recurse into nested functions: each is scored independently.
    if (!root && functionTypes.has(node.type)) return;

    let nextDepth = depth;

    if (incrementTypes.has(node.type)) {
      score += 1 + depth;
      nextDepth = depth + 1;
    } else if (booleanOpNodes.has(node.type)) {
      // Python: `a and b` is a `boolean_operator` node.
      score += 1;
    } else if (node.type === 'binary_expression') {
      // JS/Go: `&&` / `||` on a binary_expression.
      const op = node.childForFieldName('operator')?.text;
      if (op && logicalOps.has(op)) score += 1;
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) visit(child, nextDepth, false);
    }
  };

  visit(fnNode, 0, true);
  return score;
}

/** Human-readable name + the node to anchor the report on. */
function functionLabel(fnNode: TSNode): { name: string; anchor: TSNode } {
  const nameNode = fnNode.childForFieldName('name');
  if (nameNode) return { name: nameNode.text, anchor: nameNode };
  // Arrow / anonymous function expression: anchor on the function node itself.
  return { name: '<anonymous>', anchor: fnNode };
}

export const cognitiveComplexityRule: Rule = {
  id: 'IED-H001',
  name: 'cognitive-complexity',
  category: 'quality',
  severity: Severity.Info,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue', 'python', 'go'],
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

  run(ctx: RuleContext): void {
    const threshold =
      typeof ctx.config.threshold === 'number' ? ctx.config.threshold : DEFAULT_THRESHOLD;
    const profile = profileFor(ctx.language);
    const functionTypes = new Set(profile.functionNodes);

    const walk = (node: TSNode): void => {
      if (functionTypes.has(node.type)) {
        const score = scoreFunction(node, profile);
        if (score > threshold) {
          const { name, anchor } = functionLabel(node);
          if (!ctx.isSuppressed(anchor.startPosition.row, 'IED-H001')) {
            ctx.report({
              message: `Function "${name}" has cognitive complexity ${score} (threshold ${threshold}).`,
              severity: Severity.Info,
              range: nodeRange(anchor),
              data: { name, score, threshold }
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
