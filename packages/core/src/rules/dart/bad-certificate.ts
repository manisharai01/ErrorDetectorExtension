/**
 * IED-S023 — bad-certificate-callback (Dart)
 *
 * `HttpClient.badCertificateCallback` decides whether to accept a TLS
 * certificate that failed validation. A callback that always returns `true`
 * accepts ANY certificate — expired, self-signed or an attacker's — which turns
 * every HTTPS request into a man-in-the-middle opportunity. It is usually added
 * to get past a dev/staging certificate and then ships to production.
 *
 * Flags plain assignments (`client.badCertificateCallback = …`) and cascades
 * (`HttpClient()..badCertificateCallback = …`) whose callback is `=> true` or
 * a block that returns `true`. Conditional callbacks (e.g. pinning a host) are
 * not flagged.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext
} from '../types';

const ACCEPT_ALL =
  /badCertificateCallback\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?:=>\s*true\b|\{\s*return\s+true\s*;\s*\})/;

export const dartBadCertificateRule: Rule = {
  id: 'IED-S023',
  name: 'bad-certificate-callback',
  category: 'security',
  severity: Severity.Error,
  languages: ['dart'],
  description: 'TLS certificate validation disabled (badCertificateCallback returns true).',
  docs: [
    '# bad-certificate-callback (IED-S023)',
    '',
    'A `badCertificateCallback` that always returns `true` accepts any TLS',
    'certificate, so traffic can be intercepted and modified (MITM).',
    '',
    '```dart',
    'client.badCertificateCallback = (cert, host, port) => true; // flagged',
    '```',
    '',
    'Remove it, or pin the expected certificate / restrict it to a debug-only',
    'host check.'
  ].join('\n'),

  nodeTypes: () => ['assignment_expression', 'cascade_section'],

  run(ctx: RuleContext): void {
    for (const node of ctx.nodesOfType(['assignment_expression', 'cascade_section'])) {
      const text = node.text;
      if (!text.includes('badCertificateCallback') || !ACCEPT_ALL.test(text)) continue;
      if (ctx.isSuppressed(node.startPosition.row, 'IED-S023')) continue;
      ctx.report({
        message:
          'TLS certificate validation is disabled (badCertificateCallback returns true) — any certificate is accepted, enabling man-in-the-middle attacks.',
        severity: Severity.Error,
        range: nodeRange(node)
      });
    }
  }
};
