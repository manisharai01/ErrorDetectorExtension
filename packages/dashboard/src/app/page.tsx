export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getStore } from '@/lib/db';
import { Score, Sparkline } from './ui';

export default function OverviewPage() {
  const o = getStore().orgOverview();
  return (
    <div>
      <h1>Organization overview</h1>
      <p className="muted">{o.repoCount} repositor{o.repoCount === 1 ? 'y' : 'ies'} analyzed</p>

      <div className="cards">
        <div className="card">
          <div className="metric">
            <Score value={o.score} />
          </div>
          <div className="label">Quality score</div>
        </div>
        <div className="card">
          <div className="metric" style={{ color: 'var(--error)' }}>{o.errors}</div>
          <div className="label">Errors</div>
        </div>
        <div className="card">
          <div className="metric" style={{ color: 'var(--warning)' }}>{o.warnings}</div>
          <div className="label">Warnings</div>
        </div>
        <div className="card">
          <div className="metric" style={{ color: 'var(--info)' }}>{o.infos}</div>
          <div className="label">Info</div>
        </div>
        <div className="card">
          <div className="metric">{o.total}</div>
          <div className="label">Total findings</div>
        </div>
      </div>

      <h2>Findings trend</h2>
      <Sparkline points={o.trend.map((t) => t.total)} width={360} height={56} />

      <h2>Top problem repositories</h2>
      {o.topRepos.length === 0 ? (
        <p className="empty">No scans ingested yet. Run <code>ied scan --report-to &lt;url&gt;/api/ingest</code>.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Repository</th>
              <th>Score</th>
              <th>Errors</th>
              <th>Warnings</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {o.topRepos.map((r) => (
              <tr key={r.repo}>
                <td>
                  <Link href={`/repos/${encodeURIComponent(r.repo)}`}>{r.repo}</Link>
                </td>
                <td>
                  <Score value={r.score} />
                </td>
                <td>{r.errors}</td>
                <td>{r.warnings}</td>
                <td>{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
