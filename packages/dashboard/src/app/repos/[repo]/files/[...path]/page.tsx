export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getStore } from '@/lib/db';
import { SeverityPill } from '../../../../ui';

export default function FileFindingsPage({
  params
}: {
  params: { repo: string; path: string[] };
}) {
  const repo = decodeURIComponent(params.repo);
  const filePath = params.path.map(decodeURIComponent).join('/');
  const findings = getStore().fileFindings(repo, filePath);

  return (
    <div>
      <p className="muted">
        <Link href={`/repos/${encodeURIComponent(repo)}`}>← {repo}</Link>
      </p>
      <h1>{filePath}</h1>
      <p className="muted">{findings.length} finding(s) in this file</p>

      {findings.length === 0 ? (
        <p className="empty">No findings in this file.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Severity</th>
              <th>Rule</th>
              <th>Line</th>
              <th>Message</th>
              <th></th>
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
                <td>{f.line}</td>
                <td>{f.message}</td>
                <td>
                  {f.fingerprint ? (
                    <form action="/api/false-positive" method="post">
                      <input type="hidden" name="fingerprint" value={f.fingerprint} />
                      <input type="hidden" name="ruleId" value={f.ruleId} />
                      <input type="hidden" name="redirect" value={`/repos/${encodeURIComponent(repo)}`} />
                      <button type="submit">mark false positive</button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted" style={{ marginTop: 24 }}>
        Code context (±3 lines) requires the source snapshot, which the scanner can attach to a
        future ingest payload; today the dashboard stores findings only.
      </p>
    </div>
  );
}
