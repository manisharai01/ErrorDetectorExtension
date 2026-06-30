/**
 * IED-L009 — unreachable-code
 *
 * Flags the first statement that follows an unconditional control-flow exit
 * (`return` / `throw` / `break` / `continue`) within the same block — it can
 * never execute. Hoisted `function` declarations and empty statements are
 * skipped (they are not executable dead code in a meaningful sense).
 *
 * Single-file control-flow slice of the deferred "path-analysis" work; operates
 * per statement block, no full CFG.
 */
import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

const TERMINATORS = new Set([
  'return_statement',
  'throw_statement',
  'break_statement',
  'continue_statement'
]);

/** Statements that aren't meaningfully "unreachable" even after a terminator. */
const SKIP = new Set(['function_declaration', 'empty_statement', 'comment']);

export const unreachableCodeRule: Rule = {
  id: 'IED-L009',
  name: 'unreachable-code',
  category: 'logic',
  severity: Severity.Warning,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue'],
  description: 'Statement that can never run because it follows return/throw/break/continue.',
  docs: [
    '# unreachable-code (IED-L009)',
    '',
    'Code placed after an unconditional `return`, `throw`, `break`, or `continue`',
    'in the same block never executes. Remove it or fix the control flow.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const checkBlock = (block: TSNode): void => {
      let terminated = false;
      for (let i = 0; i < block.namedChildCount; i++) {
        const stmt = block.namedChild(i);
        if (!stmt) continue;
        if (terminated) {
          if (SKIP.has(stmt.type)) continue;
          if (!ctx.isSuppressed(stmt.startPosition.row, 'IED-L009')) {
            ctx.report({
              message: 'Unreachable code — the previous statement always exits the block.',
              severity: Severity.Warning,
              range: nodeRange(stmt)
            });
          }
          return; // one report per block is enough
        }
        if (TERMINATORS.has(stmt.type)) terminated = true;
      }
    };

    const walk = (node: TSNode): void => {
      if (node.type === 'statement_block') checkBlock(node);
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child);
      }
    };

    walk(ctx.tree.rootNode);
  }
};
