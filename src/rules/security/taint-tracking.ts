/**
 * Lightweight intra-file taint tracker.
 *
 * Sources:
 *   - req.body / req.params / req.query
 *   - process.argv
 *   - location.search / window.location.* / document.location.*
 *
 * Sinks:
 *   - eval / new Function
 *   - innerHTML / outerHTML / insertAdjacentHTML
 *   - child_process.exec / execSync / spawn (with first arg)
 *   - db.query / connection.query / .raw / sequelize.query (string concat)
 *
 * Flow:
 *   - direct sink(value) where `value` is a tainted symbol
 *   - through `let y = source; sink(y)` (one-hop)
 *   - through template strings / `+` concatenation that include a tainted symbol
 *
 * The trace is reported as a `trace` array on the issue so the hover provider
 * can render "value from line X → used at line Y".
 */
import * as ts from 'typescript';
import { Rule, TraceStep } from '../../rules-engine/types';
import { locOf, visit } from '../../rules-engine/engine';

const SOURCE_RE = /\b(req\.(body|params|query)|process\.argv|window\.location|document\.location|location\.search)\b/;
const SQL_SINKS = new Set(['query', 'raw']);
const HTML_SINKS = new Set(['innerHTML', 'outerHTML']);
const HTML_CALL_SINKS = new Set(['insertAdjacentHTML']);
const EXEC_SINKS = new Set(['exec', 'execSync', 'spawn', 'spawnSync']);

interface TaintInfo { line: number; description: string; }

export const taintTrackingRule: Rule = {
  meta: {
    id: 'security/taint-flow',
    name: 'Tainted data reaches a sensitive sink',
    description: 'User-controlled input flows into eval, DOM HTML, child_process or a SQL query without sanitisation.',
    category: 'security',
    defaultSeverity: 'error',
    defaultConfidence: 0.85
  },
  run(ctx) {
    const sf = ctx.ast as ts.SourceFile;
    const tainted = new Map<string, TaintInfo>();

    // 1. Seed taint from sources.
    visit(sf, n => {
      // function parameter named like a request
      if (ts.isParameter(n) && ts.isIdentifier(n.name)) {
        if (/^(req|request)$/i.test(n.name.text)) {
          tainted.set(n.name.text, { line: lineOf(n, sf), description: 'incoming HTTP request parameter' });
        }
      }
      // const x = req.body.foo
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
        const text = n.initializer.getText(sf);
        if (SOURCE_RE.test(text)) {
          tainted.set(n.name.text, { line: lineOf(n, sf), description: `value from "${text}"` });
        }
      }
    });

    // 2. Propagate one-hop: let y = x  /  let y = `...${x}...`
    let changed = true;
    while (changed) {
      changed = false;
      visit(sf, n => {
        if (!ts.isVariableDeclaration(n) || !ts.isIdentifier(n.name) || !n.initializer) return;
        const dependsOn = identifiersIn(n.initializer);
        for (const id of dependsOn) {
          if (tainted.has(id) && !tainted.has(n.name.text)) {
            tainted.set(n.name.text, {
              line: lineOf(n, sf),
              description: `derived from tainted "${id}"`
            });
            changed = true;
            break;
          }
        }
      });
    }

    // 3. Walk sinks.
    visit(sf, n => {
      // eval(x)
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'eval') {
        flagIfTaintedArg(n, n.arguments[0], 'eval()', 'security/taint-flow', sf, tainted, ctx);
      }
      // new Function(x)
      if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'Function') {
        flagIfTaintedArg(n, n.arguments?.[0], 'new Function()', 'security/taint-flow', sf, tainted, ctx);
      }
      // assignment to .innerHTML/.outerHTML
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
          && ts.isPropertyAccessExpression(n.left) && HTML_SINKS.has(n.left.name.text)) {
        flagIfTaintedArg(n, n.right, n.left.name.text, 'security/taint-flow', sf, tainted, ctx);
      }
      // .insertAdjacentHTML(pos, html)
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
          && HTML_CALL_SINKS.has(n.expression.name.text)) {
        flagIfTaintedArg(n, n.arguments[1], n.expression.name.text, 'security/taint-flow', sf, tainted, ctx);
      }
      // child_process style: exec(cmd) / spawn(cmd)
      if (ts.isCallExpression(n)) {
        const callee = ts.isIdentifier(n.expression) ? n.expression.text
          : ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : null;
        if (callee && EXEC_SINKS.has(callee)) {
          flagIfTaintedArg(n, n.arguments[0], `${callee}()`, 'security/taint-flow', sf, tainted, ctx);
        }
        if (callee && SQL_SINKS.has(callee)) {
          flagIfTaintedArg(n, n.arguments[0], `${callee}() (SQL)`, 'security/taint-flow', sf, tainted, ctx);
        }
      }
    });
  }
};

function lineOf(n: ts.Node, sf: ts.SourceFile): number {
  return sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
}

function identifiersIn(expr: ts.Expression): string[] {
  const out: string[] = [];
  const walk = (n: ts.Node) => {
    if (ts.isIdentifier(n)) out.push(n.text);
    else ts.forEachChild(n, walk);
  };
  walk(expr);
  return out;
}

function flagIfTaintedArg(
  sinkNode: ts.Node,
  arg: ts.Expression | undefined,
  sinkLabel: string,
  ruleId: string,
  sf: ts.SourceFile,
  tainted: Map<string, TaintInfo>,
  ctx: import('../../rules-engine/types').RuleContext
) {
  if (!arg) return;
  const ids = identifiersIn(arg);
  // Also consider raw concatenation/template referencing source patterns.
  const concatHasSource = /Template|BinaryExpression/.test(ts.SyntaxKind[arg.kind]) && SOURCE_RE.test(arg.getText(sf));
  let taintedId: string | null = null;
  for (const id of ids) if (tainted.has(id)) { taintedId = id; break; }
  if (!taintedId && !concatHasSource) return;

  const trace: TraceStep[] = [];
  if (taintedId) {
    const seed = tainted.get(taintedId)!;
    trace.push({
      filePath: ctx.filePath,
      location: { startLine: seed.line, startCol: 1, endLine: seed.line, endCol: 1 },
      description: seed.description
    });
  }
  trace.push({
    filePath: ctx.filePath,
    location: locOf(sinkNode, sf),
    description: `flows into ${sinkLabel}`
  });

  ctx.report({
    message: `Untrusted input flows into ${sinkLabel}.`,
    severity: 'error',
    confidence: 0.8,
    location: locOf(sinkNode, sf),
    trace,
    explanation: {
      summary: 'A value originating from user-controlled input reaches a sensitive operation without visible sanitisation.',
      whyItMatters: 'Direct flows like this are how XSS, SQL injection, and remote command execution vulnerabilities ship to production.',
      suggestedFix: 'Validate / escape the value at the boundary, use a parameterised API (prepared statements, DOM textContent, child_process.spawn(arr)).'
    }
  });
}
