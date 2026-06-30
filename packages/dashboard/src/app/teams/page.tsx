export const dynamic = 'force-dynamic';

import { getStore } from '@/lib/db';
import { Score } from '../ui';

export default function TeamsPage() {
  const teams = getStore().teamView();
  return (
    <div>
      <h1>Teams</h1>
      <p className="muted">Compare teams by average quality score and total findings.</p>
      {teams.length === 0 ? (
        <p className="empty">No data yet. Tag scans with a team via the ingest metadata.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>Repos</th>
              <th>Avg score</th>
              <th>Total findings</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.team}>
                <td>{t.team}</td>
                <td>{t.repoCount}</td>
                <td>
                  <Score value={t.avgScore} />
                </td>
                <td>{t.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
