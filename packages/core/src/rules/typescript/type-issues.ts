/**
 * TypeScript type-safety rules (ported from src/rules/typescript/type-issues.ts).
 *
 *   IED-T001 unsafe-as           — `x as Foo` casts (except `as const` / `as unknown`).
 *   IED-T002 any-type            — uses of the `any` type.
 *   IED-T003 non-null-assertion  — the `!` postfix operator.
 *
 * These are walk-based: Tree-sitter queries cannot easily distinguish `as const`
 * from `as Foo` by predicate alone, so we inspect node children directly. Only
 * the TypeScript family of languages carry these constructs.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const DEFAULT_ANY_THRESHOLD = 5;

/** Type targets that make an `as` cast safe (no type-system escape). */
const SAFE_AS_TYPES = new Set(['const', 'unknown']);

/** Walk every node in the tree, invoking `fn` on each. */
function walkTree(root: TSNode, fn: (n: TSNode) => void): void {
  const walk = (node: TSNode): void => {
    fn(node);
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child);
    }
  };
  walk(root);
}

/**
 * For an `as_expression` or `type_assertion`, return the text of the asserted
 * type, e.g. `Foo`, `const`, `unknown`. `as_expression` children are
 * `(expr) "as" (type)`; `type_assertion` is `(type_arguments <T>) (expr)`.
 */
function assertedTypeText(node: TSNode): string {
  if (node.type === 'as_expression') {
    // Children are `(expr) "as" (type)`. The type is the child right after the
    // `as` keyword. Note `as const` is an UNNAMED `const` child, so we cannot
    // rely on namedChild() here — scan all children.
    for (let i = 0; i < node.childCount; i++) {
      if (node.child(i)?.type === 'as') {
        return (node.child(i + 1)?.text ?? '').trim();
      }
    }
    // Fallback: last child is the type.
    return (node.child(node.childCount - 1)?.text ?? '').trim();
  }
  if (node.type === 'type_assertion') {
    const args = node.childForFieldName('type') ?? node.namedChild(0);
    // type_arguments looks like "<Foo>"; strip the angle brackets.
    return (args?.text ?? '').replace(/^<|>$/g, '').trim();
  }
  return '';
}

export const unsafeAsRule: Rule = {
  id: 'IED-T001',
  name: 'unsafe-as',
  category: 'type-safety',
  severity: Severity.Warning,
  languages: ['typescript', 'tsx'],
  description: 'Type assertion (`as`) that bypasses the type checker.',
  docs: [
    '# unsafe-as (IED-T001)',
    '',
    'A `x as Foo` cast tells the compiler to trust you instead of proving the',
    'type. It is a common source of runtime `undefined`/shape errors.',
    '',
    '```ts',
    'const u = data as User;   // flagged',
    'const c = x as const;     // allowed (read-only literal)',
    'const v = x as unknown;   // allowed (widening, then narrow explicitly)',
    '```',
    '',
    'Prefer a type guard or a validating parse. Suppress with',
    '`// ied-disable-next-line IED-T001`.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    walkTree(ctx.tree.rootNode, (node) => {
      if (node.type !== 'as_expression' && node.type !== 'type_assertion') return;
      const typeText = assertedTypeText(node);
      if (SAFE_AS_TYPES.has(typeText)) return;
      if (ctx.isSuppressed(node.startPosition.row, 'IED-T001')) return;
      ctx.report({
        message: `Avoid unchecked 'as' cast \`as ${typeText}\` — it bypasses the type checker.`,
        severity: Severity.Warning,
        range: nodeRange(node),
        data: { type: typeText }
      });
    });
  }
};

export const anyTypeRule: Rule = {
  id: 'IED-T002',
  name: 'any-type',
  category: 'type-safety',
  severity: Severity.Info,
  languages: ['typescript', 'tsx'],
  description: 'Use of the `any` type.',
  docs: [
    '# any-type (IED-T002)',
    '',
    'Every `any` is a hole in the type system. Prefer `unknown` plus a narrowing',
    'check, or a precise type.',
    '',
    '```ts',
    'function f(p: any) {}   // flagged',
    '```',
    '',
    'Each `any` is reported individually. Configure the noise threshold with',
    '`{ "options": { "threshold": 5 } }` (used only for the data bag).'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const threshold =
      typeof ctx.config.threshold === 'number' ? ctx.config.threshold : DEFAULT_ANY_THRESHOLD;

    const hits: TSNode[] = [];
    walkTree(ctx.tree.rootNode, (node) => {
      if (node.type === 'predefined_type' && node.text === 'any') hits.push(node);
    });

    for (const node of hits) {
      if (ctx.isSuppressed(node.startPosition.row, 'IED-T002')) continue;
      ctx.report({
        message: 'Avoid `any` — prefer `unknown` plus a narrowing check, or a precise type.',
        severity: Severity.Info,
        range: nodeRange(node),
        data: { count: hits.length, threshold, overThreshold: hits.length > threshold }
      });
    }
  }
};

export const nonNullAssertionRule: Rule = {
  id: 'IED-T003',
  name: 'non-null-assertion',
  category: 'type-safety',
  severity: Severity.Info,
  languages: ['typescript', 'tsx'],
  description: 'Non-null assertion (`!`) that bypasses null-checking.',
  docs: [
    '# non-null-assertion (IED-T003)',
    '',
    'The postfix `!` tells the compiler a value cannot be null/undefined. If you',
    'are wrong, you get a runtime crash with no compile-time warning.',
    '',
    '```ts',
    'const id = user!.id;   // flagged',
    '```',
    '',
    'Prefer an explicit guard or optional chaining. Suppress with',
    '`// ied-disable-next-line IED-T003`.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    walkTree(ctx.tree.rootNode, (node) => {
      if (node.type !== 'non_null_expression') return;
      if (ctx.isSuppressed(node.startPosition.row, 'IED-T003')) return;
      ctx.report({
        message: 'Non-null assertion `!` — verify the value cannot be null/undefined.',
        severity: Severity.Info,
        range: nodeRange(node),
        data: {}
      });
    });
  }
};

export const typeIssuesRules: Rule[] = [unsafeAsRule, anyTypeRule, nonNullAssertionRule];
