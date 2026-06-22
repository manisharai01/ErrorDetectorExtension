import * as ts from 'typescript';
import * as crypto from 'crypto';
import { Rule } from '../../rules-engine/types';
import { locOf, visit } from '../../rules-engine/engine';

/**
 * Cross-function (and ultimately cross-file) structural duplicate detection.
 * The function body is normalised — identifiers and literal values are
 * replaced with placeholders — and then hashed. Functions sharing a hash
 * are reported as structurally identical.
 *
 * The hash is also exported via `data.normalizedHash` so the workspace
 * driver can collapse duplicates discovered across files.
 */
export const astDuplicateLogicRule: Rule = {
  meta: {
    id: 'heuristics/duplicate-logic',
    name: 'Structurally identical logic',
    description: 'Two function bodies share an identical AST after normalisation.',
    category: 'heuristics',
    defaultSeverity: 'info',
    defaultConfidence: 0.85
  },
  run(ctx) {
    const sf = ctx.ast as ts.SourceFile;
    const seen = new Map<string, ts.FunctionLikeDeclaration>();
    visit(sf, n => {
      if (!ts.isFunctionLike(n)) return;
      const fn = n as ts.FunctionLikeDeclaration;
      if (!fn.body) return;
      const norm = normalize(fn.body, sf);
      // skip trivial bodies
      if (norm.length < 60) return;
      const hash = crypto.createHash('sha1').update(norm).digest('hex');
      const prior = seen.get(hash);
      if (prior) {
        ctx.report({
          message: 'Structurally identical to another function in this file.',
          severity: 'info',
          confidence: 0.85,
          location: locOf(fn, sf),
          explanation: {
            summary: 'Two functions express exactly the same logic with different names.',
            whyItMatters: 'Drift between near-duplicate functions is a top source of fix-once-bug-twice incidents.',
            suggestedFix: 'Extract a shared helper and parameterise the differences.'
          },
          data: { normalizedHash: hash }
        });
      } else {
        seen.set(hash, fn);
      }
    });
  }
};

/**
 * Walk the AST and emit a canonical, stable string. Identifier names and
 * numeric / string literal values are replaced with placeholders; only the
 * shape of the syntax remains.
 */
function normalize(node: ts.Node, _sf: ts.SourceFile): string {
  const parts: string[] = [];
  const walk = (n: ts.Node) => {
    parts.push('(');
    parts.push(String(n.kind));
    if (ts.isIdentifier(n)) parts.push(':id');
    else if (ts.isStringLiteralLike(n)) parts.push(':str');
    else if (ts.isNumericLiteral(n)) parts.push(':num');
    else if (n.kind === ts.SyntaxKind.TrueKeyword || n.kind === ts.SyntaxKind.FalseKeyword) parts.push(':bool');
    else if (n.kind === ts.SyntaxKind.NullKeyword) parts.push(':null');
    ts.forEachChild(n, walk);
    parts.push(')');
  };
  walk(node);
  return parts.join('');
}
