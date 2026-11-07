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
  ALL_LANGUAGES,
  Severity,
  nodeRange,
  type Rule,
  type RuleContext
} from '../types';
import { profileFor } from '../../engine/grammar-profile';

// Capture: directive kind, optional rule id, and the trailing remainder.
const DIRECTIVE = /(?:\/\/|#)\s*ied-(disable(?:-next-line|-line)?|enable)\b[ \t]*([A-Za-z0-9-]+)?[ \t]*(.*)$/;

export const suppressionWithoutReasonRule: Rule = {
  id: 'IED-Q013',
  name: 'suppression-without-reason',
  category: 'quality',
  severity: Severity.Warning,
  languages: ALL_LANGUAGES,
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

  nodeTypes: (language) => profileFor(language).commentNodes,

  run(ctx: RuleContext): void {
    for (const node of ctx.nodesOfType(profileFor(ctx.language).commentNodes)) {
      const m = DIRECTIVE.exec(node.text);
      if (!m) continue;
      const kind = m[1];
      const reason = (m[3] ?? '').replace(/^[\s—:-]+/, '').trim();
      // `ied-enable` just re-enables; only disables need a justification.
      const isDisable = kind.startsWith('disable');
      if (!isDisable || reason.length > 0) continue;
      if (ctx.isSuppressed(node.startPosition.row, 'IED-Q013')) continue;
      ctx.report({
        message: 'Suppression has no reason — add an explanation after the rule id.',
        severity: Severity.Warning,
        range: nodeRange(node)
      });
    }
  }
};
