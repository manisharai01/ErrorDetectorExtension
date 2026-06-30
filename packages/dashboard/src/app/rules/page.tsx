export const dynamic = 'force-dynamic';

import { getStore } from '@/lib/db';

export default function RulesPage() {
  const stats = getStore().ruleAnalytics();
  const maxCount = Math.max(1, ...stats.map((s) => s.count));
  return (
    <div>
      <h1>Rule analytics</h1>
      <p className="muted">How often each rule fires across the latest scan of every repo, and its false-positive rate.</p>
      {stats.length === 0 ? (
        <p className="empty">No findings ingested yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Rule</th>
              <th>Hits</th>
              <th>Frequency</th>
              <th>False positives</th>
              <th>FP rate</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.ruleId}>
                <td>
                  <code>{s.ruleId}</code>
                </td>
                <td>{s.count}</td>
                <td style={{ width: 160 }}>
                  <div className="bar">
                    <span style={{ width: `${(s.count / maxCount) * 100}%` }} />
                  </div>
                </td>
                <td>{s.falsePositives}</td>
                <td className={s.fpRate > 0.3 ? 'score bad' : 'muted'}>
                  {(s.fpRate * 100).toFixed(0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
