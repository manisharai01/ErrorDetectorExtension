/**
 * IED-S001 — hardcoded-secrets
 *
 * Detects API keys, tokens, and private keys committed to source. Ported from
 * the legacy `security/hardcoded-secrets` rule. Instead of scanning raw lines,
 * this version inspects `(string)` and `(template_string)` literal nodes from
 * the Tree-sitter tree and tests their text against a set of well-known secret
 * patterns. Reports on the literal node. Not auto-fixable.
 */

import {
  Severity,
  nodeRange,
  type Rule,
  type RuleContext,
  type TSNode
} from '../types';
import { profileFor } from '../../engine/grammar-profile';

interface SecretPattern {
  name: string;
  re: RegExp;
}

/**
 * Patterns ported from the original rule plus the OpenAI/Stripe/JWT additions
 * called out in the assignment. Each regex is global-free (we use `.test`),
 * so no `lastIndex` bookkeeping is required.
 */
const PATTERNS: SecretPattern[] = [
  { name: 'AWS Access Key ID', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{36,}/ },
  { name: 'OpenAI API key', re: /sk-[A-Za-z0-9]{20,}/ },
  { name: 'Stripe live key', re: /sk_live_[A-Za-z0-9]{16,}/ },
  { name: 'Slack token', re: /xox[bpors]-[A-Za-z0-9-]{10,}/ },
  { name: 'Google API key', re: /AIza[0-9A-Za-z\-_]{35}/ },
  { name: 'Private key', re: /-----BEGIN (?:RSA|EC|OPENSSH|DSA|PRIVATE) PRIVATE KEY-----/ },
  { name: 'JSON Web Token', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ }
];

export const hardcodedSecretsRule: Rule = {
  id: 'IED-S001',
  name: 'hardcoded-secrets',
  category: 'security',
  severity: Severity.Error,
  languages: ['javascript', 'typescript', 'jsx', 'tsx', 'vue', 'python', 'go', 'rust', 'java', 'kotlin'],
  description: 'API keys, tokens, or private keys hardcoded in source.',
  docs: [
    '# hardcoded-secrets (IED-S001)',
    '',
    'Secrets committed to source control are effectively public. Move them to',
    'environment variables or a secret manager and rotate any that leaked.',
    '',
    '```js',
    'const key = "AKIAIOSFODNN7EXAMPLE12"; // flagged',
    '```'
  ].join('\n'),

  run(ctx: RuleContext): void {
    const seen = new Set<string>();

    const inspect = (node: TSNode | undefined): void => {
      if (!node) return;
      const text = node.text;
      for (const p of PATTERNS) {
        if (!p.re.test(text)) continue;
        const row = node.startPosition.row;
        // De-dupe: one literal can match several patterns; report once per node.
        const dedupeKey = `${row}:${node.startPosition.column}`;
        if (seen.has(dedupeKey)) return;
        if (ctx.isSuppressed(row, 'IED-S001')) return;
        seen.add(dedupeKey);
        ctx.report({
          message: `Possible ${p.name} hardcoded in source.`,
          severity: Severity.Error,
          range: nodeRange(node),
          data: { kind: p.name }
        });
        return;
      }
    };

    // String-literal node types differ per grammar (JS `string`/`template_string`,
    // Python `string`, Go `interpreted_string_literal`/`raw_string_literal`), so
    // walk the tree and match against the language's string node types.
    const stringNodes = new Set(profileFor(ctx.language).stringNodes);
    const walk = (node: TSNode): void => {
      if (stringNodes.has(node.type)) {
        inspect(node);
        return; // don't descend into string-internal nodes (interpolation, etc.)
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child);
      }
    };
    walk(ctx.tree.rootNode);
  }
};
