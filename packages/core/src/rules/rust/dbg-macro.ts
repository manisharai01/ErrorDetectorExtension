/**
 * IED-Q012 — dbg-macro (Rust)
 *
 * `dbg!(...)` prints its argument (with file/line) to stderr and returns it. It
 * is a debugging aid that should never reach a commit: it spams output and can
 * leak data. This rule flags any `dbg!` invocation. Silent in test files, where
 * `dbg!` during development is harmless.
 *
 * AST shape: `dbg!(x)` parses as a `macro_invocation` whose `macro` child is an
 * `identifier` with text "dbg".
 *
 * (IED-Q012, not IED-Q009 — Q009 is the Python `print` rule.)
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

export const dbgMacroRule: Rule = {
  id: 'IED-Q012',
  name: 'dbg-macro',
  category: 'quality',
  severity: Severity.Warning,
  languages: ['rust'],
  description: 'A dbg!() macro invocation was left in the code.',
  docs: [
    '# dbg-macro (IED-Q012)',
    '',
    '`dbg!(...)` is a debugging macro that prints to stderr and is not meant to',
    'be committed.',
    '',
    '```rust',
    'let n = dbg!(compute());  // flagged: remove before committing',
    '```',
    '',
    'Delete it, or use a structured logger (`log`, `tracing`) for output you',
    'intend to keep. Relaxed inside test files.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    if (ctx.isTestFile) return;

    const walk = (node: TSNode): void => {
      if (node.type === 'macro_invocation') {
        const macro = node.childForFieldName('macro');
        if (macro && macro.type === 'identifier' && macro.text === 'dbg') {
          if (!ctx.isSuppressed(node.startPosition.row, 'IED-Q012')) {
            ctx.report({
              message: 'Remove dbg!() before committing.',
              severity: Severity.Warning,
              range: nodeRange(node)
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
