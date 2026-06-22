import * as ts from 'typescript';
import { Rule } from '../../rules-engine/types';
import { locOf, visit } from '../../rules-engine/engine';

/**
 * Cognitive complexity (SonarSource-inspired): increments for each
 * control-flow construct, with extra weight for nesting and boolean
 * operator chains. Triggers above a threshold of 15.
 */
export const cognitiveComplexityRule: Rule = {
  meta: {
    id: 'heuristics/cognitive-complexity',
    name: 'High cognitive complexity',
    description: 'Function is hard to read because of nested control flow and long boolean chains.',
    category: 'heuristics',
    defaultSeverity: 'info',
    defaultConfidence: 0.85
  },
  run(ctx) {
    const sf = ctx.ast as ts.SourceFile;
    const THRESHOLD = 15;
    visit(sf, n => {
      if (!ts.isFunctionLike(n) || !(n as ts.FunctionLikeDeclaration).body) return;
      const fn = n as ts.FunctionLikeDeclaration;
      const score = scoreCognitive(fn.body!, 0);
      if (score >= THRESHOLD) {
        const name = (fn as any).name?.getText(sf) ?? '<anonymous>';
        ctx.report({
          message: `Function "${name}" has cognitive complexity ${score} (threshold ${THRESHOLD}).`,
          severity: 'info',
          confidence: 0.9,
          location: locOf(fn, sf),
          explanation: {
            summary: 'Reading this function requires holding too many branches in your head at once.',
            whyItMatters: 'High cognitive complexity correlates strongly with bug rate and onboarding pain.',
            suggestedFix: 'Extract early-return guards, split nested branches into helper functions, or invert if/else for clarity.'
          }
        });
      }
    });
  }
};

function scoreCognitive(node: ts.Node, depth: number): number {
  let score = 0;
  const visitN = (n: ts.Node, d: number) => {
    let next = d;
    let inc = 0;
    if (ts.isIfStatement(n) || ts.isForStatement(n) || ts.isForInStatement(n)
        || ts.isForOfStatement(n) || ts.isWhileStatement(n) || ts.isDoStatement(n)
        || ts.isCatchClause(n) || ts.isSwitchStatement(n) || ts.isConditionalExpression(n)) {
      inc = 1 + d; next = d + 1;
    }
    if (ts.isBinaryExpression(n) &&
        (n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
         n.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
      inc = 1;
    }
    score += inc;
    ts.forEachChild(n, c => visitN(c, next));
  };
  visitN(node, depth);
  return score;
}

/**
 * Variables that are assigned and then immediately re-assigned without being
 * read in between — a classic "lost write" smell.
 */
export const overwrittenBeforeUseRule: Rule = {
  meta: {
    id: 'heuristics/overwritten-before-use',
    name: 'Variable overwritten before use',
    description: 'A value is assigned, then re-assigned without being read first.',
    category: 'heuristics',
    defaultSeverity: 'warning',
    defaultConfidence: 0.8
  },
  run(ctx) {
    const sf = ctx.ast as ts.SourceFile;
    visit(sf, n => {
      if (!ts.isBlock(n)) return;
      const lastWrite = new Map<string, ts.Node>();
      const reads = new Set<string>();
      for (const stmt of n.statements) {
        // collect reads inside this stmt before processing writes
        readsIn(stmt, reads);
        // detect writes
        if (ts.isExpressionStatement(stmt) && ts.isBinaryExpression(stmt.expression)
            && stmt.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
            && ts.isIdentifier(stmt.expression.left)) {
          const name = stmt.expression.left.text;
          if (lastWrite.has(name) && !reads.has(name)) {
            ctx.report({
              message: `"${name}" is overwritten before its previous value is read.`,
              severity: 'warning',
              confidence: 0.8,
              location: locOf(lastWrite.get(name)!, sf),
              explanation: {
                summary: 'The first assignment is dead — the second one wins.',
                whyItMatters: 'This usually means a copy-paste bug or a missed branch; the original computation is wasted.',
                suggestedFix: 'Delete the first assignment, or guard the second one behind the condition you actually meant.'
              }
            });
          }
          lastWrite.set(name, stmt);
          reads.delete(name);
        }
      }
    });
  }
};

function readsIn(n: ts.Node, set: Set<string>) {
  const skip = new Set<ts.Node>();
  if (ts.isExpressionStatement(n) && ts.isBinaryExpression(n.expression)
      && n.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isIdentifier(n.expression.left)) {
    skip.add(n.expression.left);
  }
  const walk = (x: ts.Node) => {
    if (skip.has(x)) return;
    if (ts.isIdentifier(x)) set.add(x.text);
    ts.forEachChild(x, walk);
  };
  walk(n);
}

/**
 * Same identifier name used with conflicting "shapes" inside one function:
 * once as an array (.map / .length) and once as an object (.foo). Reports
 * with low confidence because TS unions can legitimately exhibit this.
 */
export const inconsistentNamingRule: Rule = {
  meta: {
    id: 'heuristics/inconsistent-usage',
    name: 'Variable used inconsistently',
    description: 'Same identifier accessed with conflicting member-shapes (e.g. as both array and object).',
    category: 'heuristics',
    defaultSeverity: 'info',
    defaultConfidence: 0.5
  },
  run(ctx) {
    const sf = ctx.ast as ts.SourceFile;
    visit(sf, fn => {
      if (!ts.isFunctionLike(fn) || !(fn as ts.FunctionLikeDeclaration).body) return;
      const usage = new Map<string, Set<string>>();
      const walk = (n: ts.Node) => {
        if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)) {
          const set = usage.get(n.expression.text) ?? new Set<string>();
          set.add(n.name.text);
          usage.set(n.expression.text, set);
        }
        ts.forEachChild(n, walk);
      };
      walk((fn as ts.FunctionLikeDeclaration).body!);
      for (const [name, members] of usage) {
        const arrayish = ['length', 'map', 'filter', 'forEach', 'reduce', 'push', 'pop'].some(m => members.has(m));
        const objectish = [...members].some(m => /^[a-z][a-zA-Z0-9_]*$/.test(m) && !['length', 'map', 'filter', 'forEach', 'reduce', 'push', 'pop'].includes(m));
        if (arrayish && objectish) {
          ctx.report({
            message: `"${name}" is used as both an array and an object in this function.`,
            severity: 'info',
            confidence: 0.5,
            location: locOf(fn, sf),
            explanation: {
              summary: 'The same name carries two different meanings here.',
              whyItMatters: 'Mixed-shape variables are a common source of "x.map is not a function" runtime errors.',
              suggestedFix: 'Rename one of the usages, or normalise the value at the function entry.'
            }
          });
          break;
        }
      }
    });
  }
};
