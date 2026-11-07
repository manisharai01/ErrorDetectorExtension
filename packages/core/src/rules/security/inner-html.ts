/**
 * IED-S003 — inner-html
 *
 * Flags assignments to `.innerHTML` / `.outerHTML`, which allow XSS when the
 * assigned value is not sanitised. Ported from the legacy `security/inner-html`
 * rule. Relaxed when a sanitiser (DOMPurify / sanitize / sanitizeHtml) is
 * visible in the file.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext
} from '../types';

const HTML_SINKS = new Set(['innerHTML', 'outerHTML']);

export const innerHtmlRule: Rule = {
  id: 'IED-S003',
  name: 'inner-html',
  category: 'security',
  severity: Severity.Warning,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue'],
  description: 'Assignment to innerHTML/outerHTML without a visible sanitiser.',
  docs: [
    '# inner-html (IED-S003)',
    '',
    'Assigning to `innerHTML`/`outerHTML` parses the value as HTML and can',
    'execute injected scripts. Use `textContent`, a templating library, or a',
    'sanitiser such as DOMPurify.',
    '',
    '```js',
    'el.innerHTML = userInput; // flagged',
    '```'
  ].join('\n'),

  nodeTypes: () => ['assignment_expression'],

  run(ctx: RuleContext): void {
    // Relax when a sanitiser is visibly in scope, matching the original rule.
    const sanitisedInScope = /\bDOMPurify\b|\bsanitize(?:Html)?\b/i.test(ctx.sourceCode);
    if (sanitisedInScope) return;

    for (const assign of ctx.nodesOfType('assignment_expression')) {
      const left = assign.childForFieldName('left');
      if (!left || left.type !== 'member_expression') continue;
      const prop = left.childForFieldName('property');
      if (!prop || prop.type !== 'property_identifier') continue;
      if (!HTML_SINKS.has(prop.text)) continue;
      if (ctx.isSuppressed(assign.startPosition.row, 'IED-S003')) continue;
      ctx.report({
        message: `Assignment to ${prop.text} without a visible sanitiser (e.g. DOMPurify).`,
        severity: Severity.Warning,
        range: nodeRange(assign),
        data: { sink: prop.text }
      });
    }
  }
};
