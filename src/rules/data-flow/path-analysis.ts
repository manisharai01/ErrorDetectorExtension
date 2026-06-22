import * as ts from 'typescript';
import { Rule } from '../../rules-engine/types';
import { locOf, visit } from '../../rules-engine/engine';
import { FunctionAnalyzer } from '../../rules-engine/cfg';

const explanationFor = (kind: 'cond' | 'unreachable' | 'null' | 'await') => {
  switch (kind) {
    case 'cond': return {
      summary: 'This condition can never change at runtime.',
      whyItMatters: 'Dead branches mask bugs and confuse code reviewers — the intended logic was probably different.',
      suggestedFix: 'Re-read the boolean: did you mean `||` instead of `&&`, or swap one of the operands?',
      example: { bad: 'if (x > 10 && x < 5) { … }', good: 'if (x > 10 || x < 5) { … }' }
    };
    case 'unreachable': return {
      summary: 'Code after this point can never execute.',
      whyItMatters: 'Unreachable code is a strong indicator of a refactor gone wrong; it also misleads coverage tools.',
      suggestedFix: 'Delete it, or move it before the early-return / throw above.'
    };
    case 'null': return {
      summary: 'You are dereferencing a value that may be null/undefined on at least one branch.',
      whyItMatters: 'A single null path causes a runtime "cannot read properties of undefined" — usually in production, not in dev.',
      suggestedFix: 'Add an explicit guard (`if (x)`) or use optional chaining (`x?.y`).',
      example: { bad: 'const u = users.find(...); return u.name;', good: 'const u = users.find(...); return u?.name ?? "anon";' }
    };
    case 'await': return {
      summary: 'An async call appears in a chain that doesn\'t propagate the promise.',
      whyItMatters: 'Missing awaits cause "fire and forget" bugs: the next line runs against stale data.',
      suggestedFix: 'Await the call, or return the promise so the caller can chain.'
    };
  }
};

export const pathAnalysisRule: Rule = {
  meta: {
    id: 'flow/path-analysis',
    name: 'Control-flow / path analysis',
    description: 'Detects always-true/false conditions, unreachable code and possible null derefs.',
    category: 'data-flow',
    defaultSeverity: 'warning',
    defaultConfidence: 0.85
  },
  run(ctx) {
    const sf = ctx.ast as ts.SourceFile;
    visit(sf, n => {
      if (!ts.isFunctionLike(n)) return;
      const fn = n as ts.FunctionLikeDeclaration;
      if (!fn.body) return;
      const a = new FunctionAnalyzer(fn).analyze();

      for (const t of a.trivialConditions) {
        ctx.report({
          message: `Condition is ${t.verdict.replace('-', ' ')}.`,
          severity: t.verdict === 'always-false' ? 'error' : 'warning',
          confidence: 0.9,
          location: locOf(t.node, sf),
          explanation: explanationFor('cond')
        });
      }
      for (const u of a.unreachable) {
        ctx.report({
          message: 'Unreachable code.',
          severity: 'warning',
          confidence: 0.95,
          location: locOf(u, sf),
          explanation: explanationFor('unreachable')
        });
      }
      for (const d of a.nullDerefs) {
        ctx.report({
          message: `"${d.symbol}" may be null/undefined here.`,
          severity: 'warning',
          confidence: 0.7,
          location: locOf(d.node, sf),
          explanation: explanationFor('null')
        });
      }
    });
  }
};

export const missingAwaitChainRule: Rule = {
  meta: {
    id: 'flow/missing-await-chain',
    name: 'Missing await in async chain',
    description: 'A `.then(...)` callback that returns a promise without chaining or awaiting.',
    category: 'data-flow',
    defaultSeverity: 'warning',
    defaultConfidence: 0.7
  },
  run(ctx) {
    const sf = ctx.ast as ts.SourceFile;
    visit(sf, n => {
      if (!ts.isCallExpression(n)) return;
      if (!ts.isPropertyAccessExpression(n.expression) || n.expression.name.text !== 'then') return;
      const cb = n.arguments[0];
      if (!cb || !(ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) return;
      // look for unhandled promise-returning calls inside the callback body
      const body = cb.body;
      if (!body) return;
      let suspicious: ts.Node | null = null;
      const walk = (x: ts.Node) => {
        if (suspicious) return;
        if (ts.isCallExpression(x) && ts.isPropertyAccessExpression(x.expression)
            && /Async$/.test(x.expression.name.text)
            && !(x.parent && ts.isReturnStatement(x.parent))
            && !(x.parent && ts.isAwaitExpression(x.parent))) {
          suspicious = x;
        }
        ts.forEachChild(x, walk);
      };
      walk(body);
      if (suspicious) {
        ctx.report({
          message: 'Promise inside .then() callback is not returned or awaited.',
          severity: 'warning',
          confidence: 0.65,
          location: locOf(suspicious, sf),
          explanation: explanationFor('await')
        });
      }
    });
  }
};
