export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getStore } from '@/lib/db';
import { Score, SeverityPill, Sparkline } from '../../ui';

const SEV_ORDER: Record<string, number> = { error: 0, warning: 1, info: 2, hint: 3 };

export default function RepoDetailPage({ params }: { params: { repo: string } }) {
  const repo = decodeURIComponent(params.repo);
  const store = getStore();
  const findings = [...store.repoFindings(repo)].sort(
    (a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9)
  );
  const trend = store.repoTrend(repo);
  const latest = trend.length ? trend[trend.length - 1] : null;

  return (
    <div>
      <p className="muted">
        <Link href="/repos">← Repositories</Link>
      </p>
      <h1>{repo}</h1>
      {latest && (
        <p>
          Quality score: <Score value={latest.score} /> · {findings.length} current findings
        </p>
      )}

      <h2>Score trend</h2>
      <Sparkline points={trend.map((t) => t.score)} width={360} height={56} />

      <h2>Findings</h2>
      {findings.length === 0 ? (
        <p className="empty">No findings 🎉</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Severity</th>
              <th>Rule</th>
              <th>File</th>
              <th>Line</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {findings.map((f, i) => (
              <tr key={i}>
                <td>
                  <SeverityPill severity={f.severity} />
                </td>
                <td>
                  <code>{f.ruleId}</code>
                </td>
                <td>
                  <Link
                    href={`/repos/${encodeURIComponent(repo)}/files/${f.filePath
                      .split('/')
                      .map(encodeURIComponent)
                      .join('/')}`}
                  >
                    {f.filePath}
                  </Link>
                </td>
                <td>{f.line}</td>
                <td>{f.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
