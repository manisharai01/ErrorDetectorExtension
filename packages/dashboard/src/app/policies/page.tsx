export const dynamic = 'force-dynamic';

import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_POLICY = {
  version: 1,
  name: 'Org Security Policy',
  rules: {
    'IED-S001': { severity: 'error', locked: true },
    'IED-S002': { severity: 'error', locked: true },
    'IED-Q001': { severity: 'warn', locked: false }
  },
  thresholds: { maxErrors: 0, maxWarnings: 50, minScore: 80 },
  locked: ['IED-S*']
};

function readPolicy(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), '.ied-policy.json'), 'utf8');
  } catch {
    return JSON.stringify(DEFAULT_POLICY, null, 2);
  }
}

export default function PoliciesPage() {
  const policy = readPolicy();
  return (
    <div>
      <h1>Org policy</h1>
      <p className="muted">
        Rules marked <code>&quot;locked&quot;: true</code> (or matched by a <code>locked</code> glob like{' '}
        <code>IED-S*</code>) cannot be disabled or lowered by team/repo configs. Thresholds form the
        quality gate.
      </p>
      <form action="/api/policy" method="post">
        <textarea
          name="policy"
          defaultValue={policy}
          spellCheck={false}
          style={{
            width: '100%',
            minHeight: 360,
            background: '#0d1a35',
            color: '#a8c4ff',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 12,
            fontFamily: 'monospace',
            fontSize: 13
          }}
        />
        <div style={{ marginTop: 12 }}>
          <button type="submit">Save policy</button>
        </div>
      </form>
    </div>
  );
}
