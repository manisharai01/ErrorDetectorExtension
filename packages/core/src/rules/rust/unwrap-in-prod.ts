/**
 * IED-T006 — unwrap-in-prod (Rust)
 *
 * `.unwrap()` and `.expect(...)` panic when called on an `Err`/`None`. In
 * production code that turns a recoverable error into a crash; the value should
 * be matched or propagated with `?` instead. Tests routinely unwrap to assert
 * happy-path behaviour, so the rule is silent in test files.
 *
 * AST shape (verified against tree-sitter-rust): a method call like
 * `x.unwrap()` is a `call_expression` whose `function` is a `field_expression`
 * with a `field` of kind `field_identifier` carrying the method name.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const PANIC_METHODS = new Set(['unwrap', 'expect']);

export const unwrapInProdRule: Rule = {
  id: 'IED-T006',
  name: 'unwrap-in-prod',
  category: 'type-safety',
  severity: Severity.Warning,
  languages: ['rust'],
  description: 'unwrap()/expect() panics on Err/None; handle the Result/Option.',
  docs: [
    '# unwrap-in-prod (IED-T006)',
    '',
    '`.unwrap()` and `.expect(...)` panic on `Err`/`None`, turning a recoverable',
    'error into a crash in production code.',
    '',
    '```rust',
    'let cfg = load().unwrap();        // flagged: panics on Err',
    'let port = env("PORT").expect("set PORT"); // flagged',
    '```',
    '',
    'Prefer propagating with `?` or matching the `Result`/`Option`:',
    '',
    '```rust',
    'let cfg = load()?;',
    'let port = match env("PORT") { Some(p) => p, None => default() };',
    '```',
    '',
    'Relaxed inside test files, where unwrapping the happy path is idiomatic.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    if (ctx.isTestFile) return;

    const walk = (node: TSNode): void => {
      if (node.type === 'call_expression') {
        const fn = node.childForFieldName('function');
        if (fn && fn.type === 'field_expression') {
          const field = fn.childForFieldName('field');
          if (
            field &&
            field.type === 'field_identifier' &&
            PANIC_METHODS.has(field.text)
          ) {
            if (!ctx.isSuppressed(node.startPosition.row, 'IED-T006')) {
              ctx.report({
                message: `Avoid \`.${field.text}()\` in non-test code; handle the Result/Option (use \`?\` or \`match\`).`,
                severity: Severity.Warning,
                range: nodeRange(node),
                data: { method: field.text }
              });
            }
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
