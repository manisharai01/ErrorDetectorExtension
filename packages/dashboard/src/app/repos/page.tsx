export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getStore } from '@/lib/db';
import { Score } from '../ui';

export default function ReposPage() {
  const repos = getStore().listRepos();
  return (
    <div>
      <h1>Repositories</h1>
      {repos.length === 0 ? (
        <p className="empty">No repositories yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Repository</th>
              <th>Team</th>
              <th>Score</th>
              <th>Errors</th>
              <th>Warnings</th>
              <th>Info</th>
              <th>Last scan</th>
            </tr>
          </thead>
          <tbody>
            {repos.map((r) => (
              <tr key={r.repo}>
                <td>
                  <Link href={`/repos/${encodeURIComponent(r.repo)}`}>{r.repo}</Link>
                </td>
                <td className="muted">{r.team ?? 'unassigned'}</td>
                <td>
                  <Score value={r.score} />
                </td>
                <td>{r.errors}</td>
                <td>{r.warnings}</td>
                <td>{r.infos}</td>
                <td className="muted">{r.lastScan.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
