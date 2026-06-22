import { Rule } from '../../rules-engine/types';

interface Pattern { name: string; re: RegExp; }
const PATTERNS: Pattern[] = [
  { name: 'AWS Access Key ID',    re: /AKIA[0-9A-Z]{16}/g },
  { name: 'AWS Secret Access Key',re: /(?<![A-Za-z0-9\/+=])[A-Za-z0-9\/+=]{40}(?![A-Za-z0-9\/+=])/g },
  { name: 'GitHub token',         re: /gh[pousr]_[A-Za-z0-9]{36,}/g },
  { name: 'Slack token',          re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: 'Google API key',       re: /AIza[0-9A-Za-z\-_]{35}/g },
  { name: 'Generic API key',      re: /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']([^"']{12,})["']/gi },
  { name: 'Private key',          re: /-----BEGIN (?:RSA|EC|OPENSSH|DSA|PRIVATE) PRIVATE KEY-----/g }
];

export const hardcodedSecretsRule: Rule = {
  meta: {
    id: 'security/hardcoded-secrets',
    name: 'Hardcoded secret',
    description: 'Detects API keys, tokens or private keys committed to source.',
    category: 'security',
    defaultSeverity: 'error'
  },
  run(ctx) {
    const lines = ctx.sourceText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      for (const p of PATTERNS) {
        p.re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = p.re.exec(lines[i])) !== null) {
          const col = m.index + 1;
          ctx.report({
            message: `Possible ${p.name} hardcoded in source.`,
            severity: 'error',
            location: { startLine: i + 1, startCol: col, endLine: i + 1, endCol: col + m[0].length }
          });
        }
      }
    }
  }
};
