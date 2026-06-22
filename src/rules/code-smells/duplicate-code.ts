import * as ts from 'typescript';
import { Rule } from '../../rules-engine/types';
import { locOf, visit } from '../../rules-engine/engine';

const MIN_TOKENS = 30;
const MAX_FUNCTIONS = 200;     // skip the O(n^2) scan past this point

/**
 * Token-by-token duplicate detection inside a single file. Splits each
 * function body into its TypeScript token-kind sequence and reports pairs
 * that share a >= MIN_TOKENS prefix.
 */
export const duplicateCodeRule: Rule = {
  meta: {
    id: 'smell/duplicate-code',
    name: 'Duplicate code block',
    description: 'Two function bodies share a long identical token sequence.',
    category: 'code-smell',
    defaultSeverity: 'info',
    fixable: true
  },
  run(ctx) {
    const sf = ctx.ast as ts.SourceFile;
    const fns: { node: ts.FunctionLikeDeclaration; tokens: number[] }[] = [];
    visit(sf, n => {
      if (ts.isFunctionLike(n) && (n as ts.FunctionLikeDeclaration).body) {
        fns.push({ node: n as ts.FunctionLikeDeclaration, tokens: tokenize((n as ts.FunctionLikeDeclaration).body!, sf) });
      }
    });
    if (fns.length > MAX_FUNCTIONS) return;       // bail on very large files
    for (let i = 0; i < fns.length; i++) {
      for (let j = i + 1; j < fns.length; j++) {
        const len = sharedPrefix(fns[i].tokens, fns[j].tokens);
        if (len >= MIN_TOKENS) {
          ctx.report({
            message: `Duplicate code block (~${len} tokens) shared with another function in this file.`,
            severity: 'info',
            location: locOf(fns[j].node, sf),
            fixable: true
          });
        }
      }
    }
  }
};

function tokenize(node: ts.Node, sf: ts.SourceFile): number[] {
  const out: number[] = [];
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, /*skipTrivia*/ true, sf.languageVariant, sf.text, undefined, node.getStart(sf), node.getEnd() - node.getStart(sf));
  scanner.setTextPos(node.getStart(sf));
  let kind = scanner.scan();
  while (scanner.getTokenPos() < node.getEnd() && kind !== ts.SyntaxKind.EndOfFileToken) {
    out.push(kind);
    kind = scanner.scan();
  }
  return out;
}

function sharedPrefix(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let i = 0; while (i < n && a[i] === b[i]) i++;
  return i;
}
