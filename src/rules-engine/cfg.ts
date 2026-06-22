/**
 * Lightweight intra-procedural control-flow + variable-state analyser.
 *
 * Not a full SSA engine — intentionally small and fast. Tracks per-variable
 * abstract state across straight-line code, if/else branches, and loops with
 * a fixed-point cap. Used by the path-analysis rules (always-true conditions,
 * unreachable code, possible null/undefined access).
 */
import * as ts from 'typescript';

export type AbstractState = 'undefined' | 'null' | 'maybe-null' | 'assigned' | 'unknown';

export interface AnalyzedExpression {
  /** Constant truthiness if it can be statically determined. */
  truthiness?: 'always-true' | 'always-false';
  /** Identifiers dereferenced (`.x` or `[..]`) inside this expression. */
  derefs: string[];
}

export class FunctionAnalyzer {
  /** Final per-variable state at function exit. */
  states = new Map<string, AbstractState>();
  /** Statements determined to be unreachable. */
  unreachable: ts.Statement[] = [];
  /** Conditions determined to be statically true/false. */
  trivialConditions: Array<{ node: ts.Expression; verdict: 'always-true' | 'always-false' }> = [];
  /** Possible null/undefined dereferences. */
  nullDerefs: Array<{ node: ts.Expression; symbol: string }> = [];

  constructor(private fn: ts.FunctionLikeDeclaration) {
    if (fn.parameters) {
      for (const p of fn.parameters) {
        if (ts.isIdentifier(p.name)) {
          // optional or with `?`/default → may be undefined
          const optional = !!p.questionToken || !!p.initializer;
          this.states.set(p.name.text, optional ? 'maybe-null' : 'assigned');
        }
      }
    }
  }

  analyze(): this {
    if (!this.fn.body || !ts.isBlock(this.fn.body)) return this;
    this.walkBlock(this.fn.body, this.states);
    return this;
  }

  private walkBlock(block: ts.Block, scope: Map<string, AbstractState>): boolean {
    let live = true;
    for (const stmt of block.statements) {
      if (!live) { this.unreachable.push(stmt); continue; }
      live = this.walkStatement(stmt, scope) !== false;
    }
    return live;
  }

  /** Returns false if control-flow does not fall through this statement. */
  private walkStatement(stmt: ts.Statement, scope: Map<string, AbstractState>): boolean {
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) {
          scope.set(d.name.text, classify(d.initializer));
          if (d.initializer) this.walkExpression(d.initializer, scope);
        }
      }
      return true;
    }
    if (ts.isExpressionStatement(stmt)) { this.walkExpression(stmt.expression, scope); return true; }
    if (ts.isReturnStatement(stmt) || ts.isThrowStatement(stmt) || ts.isBreakStatement(stmt) || ts.isContinueStatement(stmt)) {
      if (ts.isReturnStatement(stmt) && stmt.expression) this.walkExpression(stmt.expression, scope);
      return false;
    }
    if (ts.isIfStatement(stmt)) {
      const cond = this.evaluateCondition(stmt.expression, scope);
      this.walkExpression(stmt.expression, scope);
      if (cond) this.trivialConditions.push({ node: stmt.expression, verdict: cond });

      const thenScope = new Map(scope);
      const elseScope = new Map(scope);
      const thenLive = cond === 'always-false'
        ? (this.markUnreachable(stmt.thenStatement), false)
        : this.walkAnyStatement(stmt.thenStatement, thenScope);
      const elseLive = stmt.elseStatement
        ? (cond === 'always-true'
            ? (this.markUnreachable(stmt.elseStatement), false)
            : this.walkAnyStatement(stmt.elseStatement, elseScope))
        : true;

      mergeInto(scope, thenScope);
      mergeInto(scope, elseScope);
      return thenLive || elseLive;
    }
    if (ts.isBlock(stmt)) return this.walkBlock(stmt, scope);
    if (ts.isWhileStatement(stmt) || ts.isDoStatement(stmt) || ts.isForStatement(stmt)
        || ts.isForOfStatement(stmt) || ts.isForInStatement(stmt)) {
      // fixed-point with cap of 2 iterations
      for (let i = 0; i < 2; i++) {
        const loopScope = new Map(scope);
        this.walkAnyStatement((stmt as any).statement ?? (stmt as any).body, loopScope);
        mergeInto(scope, loopScope);
      }
      return true;
    }
    if (ts.isTryStatement(stmt)) {
      this.walkBlock(stmt.tryBlock, new Map(scope));
      if (stmt.catchClause) this.walkBlock(stmt.catchClause.block, new Map(scope));
      if (stmt.finallyBlock) this.walkBlock(stmt.finallyBlock, scope);
      return true;
    }
    return true;
  }

  private walkAnyStatement(s: ts.Statement, scope: Map<string, AbstractState>): boolean {
    if (ts.isBlock(s)) return this.walkBlock(s, scope);
    return this.walkStatement(s, scope);
  }

  private walkExpression(expr: ts.Expression, scope: Map<string, AbstractState>): AnalyzedExpression {
    const out: AnalyzedExpression = { derefs: [] };

    const visit = (n: ts.Node) => {
      if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
        const root = n.expression;
        if (ts.isIdentifier(root)) {
          const state = scope.get(root.text);
          if (state === 'null' || state === 'undefined' || state === 'maybe-null') {
            this.nullDerefs.push({ node: n as ts.Expression, symbol: root.text });
          }
          out.derefs.push(root.text);
        }
      }
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
          && ts.isIdentifier(n.left)) {
        scope.set(n.left.text, classify(n.right));
      }
      ts.forEachChild(n, visit);
    };
    visit(expr);
    return out;
  }

  private evaluateCondition(expr: ts.Expression, _scope: Map<string, AbstractState>): 'always-true' | 'always-false' | undefined {
    // literal truthy/falsy
    if (expr.kind === ts.SyntaxKind.TrueKeyword) return 'always-true';
    if (expr.kind === ts.SyntaxKind.FalseKeyword) return 'always-false';
    if (ts.isNumericLiteral(expr)) return expr.text === '0' ? 'always-false' : 'always-true';
    if (ts.isStringLiteralLike(expr)) return expr.text.length === 0 ? 'always-false' : 'always-true';

    // x > a && x < b where the ranges are disjoint  → always-false
    if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      const a = comparison(expr.left), b = comparison(expr.right);
      if (a && b && a.variable === b.variable) {
        const lo = a.op.includes('>') ? a.value : (b.op.includes('>') ? b.value : null);
        const hi = a.op.includes('<') ? a.value : (b.op.includes('<') ? b.value : null);
        if (lo !== null && hi !== null && lo >= hi) return 'always-false';
      }
    }
    return undefined;
  }

  private markUnreachable(s: ts.Statement) {
    if (ts.isBlock(s)) for (const st of s.statements) this.unreachable.push(st);
    else this.unreachable.push(s);
  }
}

function classify(expr: ts.Expression | undefined): AbstractState {
  if (!expr) return 'undefined';
  if (expr.kind === ts.SyntaxKind.NullKeyword) return 'null';
  if (ts.isIdentifier(expr) && expr.text === 'undefined') return 'undefined';
  if (ts.isCallExpression(expr)) return 'maybe-null';
  return 'assigned';
}

function mergeInto(target: Map<string, AbstractState>, branch: Map<string, AbstractState>) {
  for (const [k, v] of branch) {
    const cur = target.get(k);
    if (cur === undefined) { target.set(k, v); continue; }
    if (cur === v) continue;
    if (cur === 'assigned' && v === 'assigned') continue;
    if (cur === 'null' || v === 'null' || cur === 'undefined' || v === 'undefined' || cur === 'maybe-null' || v === 'maybe-null') {
      target.set(k, 'maybe-null'); continue;
    }
    target.set(k, 'unknown');
  }
}

function comparison(e: ts.Expression): { variable: string; op: string; value: number } | null {
  if (!ts.isBinaryExpression(e)) return null;
  const ops: Record<number, string> = {
    [ts.SyntaxKind.GreaterThanToken]: '>',
    [ts.SyntaxKind.GreaterThanEqualsToken]: '>=',
    [ts.SyntaxKind.LessThanToken]: '<',
    [ts.SyntaxKind.LessThanEqualsToken]: '<='
  };
  const op = ops[e.operatorToken.kind];
  if (!op) return null;
  if (ts.isIdentifier(e.left) && ts.isNumericLiteral(e.right)) {
    return { variable: e.left.text, op, value: Number(e.right.text) };
  }
  if (ts.isNumericLiteral(e.left) && ts.isIdentifier(e.right)) {
    const flip: Record<string, string> = { '>': '<', '>=': '<=', '<': '>', '<=': '>=' };
    return { variable: e.right.text, op: flip[op], value: Number(e.left.text) };
  }
  return null;
}
