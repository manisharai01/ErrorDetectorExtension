import * as ts from 'typescript';
import { Rule } from '../../rules-engine/types';
import { locOf, visit } from '../../rules-engine/engine';

export const unsafeAsAssertionRule: Rule = {
  meta: {
    id: 'ts/unsafe-as',
    name: 'Unsafe `as` assertion',
    description: '`x as Foo` (other than `as const` / `as unknown`) bypasses the type system.',
    category: 'typescript',
    defaultSeverity: 'info'
  },
  run(ctx) {
    if (ctx.language !== 'ts' && ctx.language !== 'tsx') return;
    const sf = ctx.ast as ts.SourceFile;
    visit(sf, n => {
      if (!ts.isAsExpression(n)) return;
      const t = n.type.getText(sf);
      if (t === 'const' || t === 'unknown') return;
      ctx.report({
        message: `Type assertion \`as ${t}\` bypasses the type checker.`,
        severity: 'info',
        location: locOf(n, sf)
      });
    });
  }
};

export const anyTypeRule: Rule = {
  meta: {
    id: 'ts/any-type',
    name: 'Use of `any`',
    description: 'Excessive use of the `any` type.',
    category: 'typescript',
    defaultSeverity: 'info'
  },
  run(ctx) {
    if (ctx.language !== 'ts' && ctx.language !== 'tsx') return;
    const sf = ctx.ast as ts.SourceFile;
    let count = 0;
    const hits: ts.Node[] = [];
    visit(sf, n => {
      if (n.kind === ts.SyntaxKind.AnyKeyword) { count++; hits.push(n); }
    });
    // configurable threshold injected via engine options if desired (kept simple here).
    for (const n of hits) {
      ctx.report({
        message: 'Avoid `any` — prefer `unknown` plus a narrowing check.',
        severity: 'info',
        location: locOf(n, sf)
      });
    }
    if (count > 5) {
      ctx.report({
        message: `File uses \`any\` ${count} times — exceeds threshold.`,
        severity: 'warning',
        location: locOf(sf.statements[0] ?? sf, sf)
      });
    }
  }
};

export const nonNullAssertionRule: Rule = {
  meta: {
    id: 'ts/non-null-assertion',
    name: 'Non-null assertion misuse',
    description: 'The `!` postfix bypasses null-checking.',
    category: 'typescript',
    defaultSeverity: 'info'
  },
  run(ctx) {
    if (ctx.language !== 'ts' && ctx.language !== 'tsx') return;
    const sf = ctx.ast as ts.SourceFile;
    visit(sf, n => {
      if (ts.isNonNullExpression(n)) {
        ctx.report({
          message: 'Non-null assertion `!` — verify the value cannot be null/undefined.',
          severity: 'info',
          location: locOf(n, sf)
        });
      }
    });
  }
};
