/**
 * IED-S011 — bare-except
 *
 * Flags a bare `except:` clause. It swallows everything, including
 * `KeyboardInterrupt` and `SystemExit`, hiding bugs and making the program
 * impossible to interrupt. Catch a specific exception type instead.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';

export const bareExceptRule: Rule = {
  id: 'IED-S011',
  name: 'bare-except',
  category: 'security',
  severity: Severity.Warning,
  languages: ['python'],
  description: 'Bare `except:` swallows all exceptions, including control-flow ones.',
  docs: [
    '# bare-except (IED-S011)',
    '',
    'A bare `except:` catches *everything*, including `KeyboardInterrupt` and',
    '`SystemExit`, masking real errors.',
    '',
    '```py',
    'try:',
    '    work()',
    'except:        # flagged',
    '    pass',
    '```',
    '',
    'Catch a specific type: `except ValueError:` or at least `except Exception:`.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const walk = (node: TSNode): void => {
      if (node.type === 'except_clause') {
        // A typed except has a named exception expression before the body block;
        // a bare `except:` has only the `block` as a named child.
        const hasType = node.namedChildren.some((c) => c.type !== 'block' && c.type !== 'comment');
        if (!hasType) {
          if (!ctx.isSuppressed(node.startPosition.row, 'IED-S011')) {
            ctx.report({
              message: 'Bare `except:` catches everything (even KeyboardInterrupt). Catch a specific exception.',
              severity: Severity.Warning,
              range: nodeRange(node)
            });
          }
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const c = node.child(i);
        if (c) walk(c);
      }
    };
    walk(ctx.tree.rootNode);
  }
};
