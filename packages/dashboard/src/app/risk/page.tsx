export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getStore } from '@/lib/db';
import { RiskChip, riskColor } from '../ui';

export default function RiskMapPage() {
  const store = getStore();
  const repos = store.reposWithHotspots();

  if (repos.length === 0) {
    return (
      <div>
        <h1>Risk Map</h1>
        <p className="empty">No hotspot data yet.</p>
        <p className="muted">
          Predict bug-prone files by combining git churn with finding density, then report them:
        </p>
        <pre>
          <code>ied hotspots --report-to https://your-dashboard/api/ingest-hotspots</code>
        </pre>
      </div>
    );
  }

  return (
    <div>
      <h1>Risk Map</h1>
      <p className="muted">
        Files most likely to harbor bugs — ranked by how often they change (git churn) combined with
        their current finding density. High churn <em>and</em> existing findings = highest risk.
      </p>

      {repos.map((r) => {
        const hotspots = store.repoHotspots(r.repo, 25);
        return (
          <section key={r.repo} style={{ marginTop: 24 }}>
            <h2 style={{ marginBottom: 4 }}>
              <Link href={`/repos/${encodeURIComponent(r.repo)}`}>{r.repo}</Link>{' '}
              <span className="muted" style={{ fontWeight: 400, fontSize: '0.85em' }}>
                — {r.count} files · updated {r.ts.slice(0, 10)}
              </span>
            </h2>

            {/* Heat strip: one cell per file, width ∝ risk, colored by risk. */}
            <div style={{ display: 'flex', gap: 2, margin: '8px 0 12px', flexWrap: 'wrap' }}>
              {hotspots.map((h) => (
                <span
                  key={h.file}
                  title={`${h.file} — risk ${h.risk} (churn ${h.churn}, findings ${h.findingWeight})`}
                  style={{
                    display: 'inline-block',
                    width: 10 + Math.round((h.risk / 100) * 26),
                    height: 14,
                    borderRadius: 2,
                    background: riskColor(h.risk)
                  }}
                />
              ))}
            </div>

            <table>
              <thead>
                <tr>
                  <th>Risk</th>
                  <th>Churn</th>
                  <th>Findings</th>
                  <th>File</th>
                </tr>
              </thead>
              <tbody>
                {hotspots.map((h) => (
                  <tr key={h.file}>
                    <td>
                      <RiskChip risk={h.risk} />
                    </td>
                    <td>{h.churn}</td>
                    <td>{h.findingWeight}</td>
                    <td>{h.file}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
