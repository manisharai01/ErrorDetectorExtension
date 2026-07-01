/**
 * IED-Q013 — suppression-without-reason
 *
 * An inline suppression (`// ied-disable…` / `# ied-disable…`) with no
 * explanatory reason after the rule id is itself flagged: silencing a finding
 * is a decision that should be justified for the next reader (and is surfaced
 * in the governance dashboard). A reason is any text after the rule id, e.g.
 *
 *   // ied-disable-next-line IED-S001 — key is injected from the vault at boot
 *
 * Works across languages (both `//` and `#` comment markers).
 */
import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';
import { profileFor } from '../../engine/grammar-profile';

// Capture: directive kind, optional rule id, and the trailing remainder.
const DIRECTIVE = /(?:\/\/|#)\s*ied-(disable(?:-next-line|-line)?|enable)\b[ \t]*([A-Za-z0-9-]+)?[ \t]*(.*)$/;

export const suppressionWithoutReasonRule: Rule = {
  id: 'IED-Q013',
  name: 'suppression-without-reason',
  category: 'quality',
  severity: Severity.Warning,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue', 'python', 'go', 'rust', 'java', 'kotlin', 'swift', 'c', 'cpp', 'php'],
  description: 'An inline suppression comment has no reason explaining why.',
  docs: [
    '# suppression-without-reason (IED-Q013)',
    '',
    'Suppressing a finding hides a real signal, so the reason should be written',
    'down. Add an explanation after the rule id:',
    '',
    '```js',
    '// ied-disable-next-line IED-S001 — value is injected from the vault at boot',
    '```',
    '',
    'Suppressions (and their reasons) are recorded and shown in the dashboard.'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const commentNodes = new Set(profileFor(ctx.language).commentNodes);
    const walk = (node: TSNode): void => {
      if (commentNodes.has(node.type)) {
        const m = DIRECTIVE.exec(node.text);
        if (m) {
          const kind = m[1];
          const reason = (m[3] ?? '').replace(/^[\s—:-]+/, '').trim();
          // `ied-enable` just re-enables; only disables need a justification.
          const isDisable = kind.startsWith('disable');
          if (isDisable && reason.length === 0) {
            if (!ctx.isSuppressed(node.startPosition.row, 'IED-Q013')) {
              ctx.report({
                message: 'Suppression has no reason — add an explanation after the rule id.',
                severity: Severity.Warning,
                range: nodeRange(node)
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
