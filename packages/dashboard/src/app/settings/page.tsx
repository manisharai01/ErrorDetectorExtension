export const dynamic = 'force-dynamic';

import * as path from 'path';

function configured(v: string | undefined): string {
  return v ? 'configured' : 'not set';
}

export default function SettingsPage() {
  const dbPath = process.env.IED_DASHBOARD_DB || path.join(process.cwd(), 'ied-dashboard.db');
  const rows: [string, string][] = [
    ['Database', dbPath],
    ['Ingest endpoint', 'POST /api/ingest'],
    ['Jira integration', configured(process.env.JIRA_BASE_URL)],
    ['Slack integration', configured(process.env.SLACK_WEBHOOK_URL)]
  ];
  return (
    <div>
      <h1>Settings</h1>
      <p className="muted">Org configuration and integration status (set via environment).</p>
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th style={{ width: 220 }}>{k}</th>
              <td>
                <code>{v}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Connecting a CI pipeline</h2>
      <p className="muted">
        Point the CLI at this dashboard:&nbsp;
        <code>ied scan src/ --report-to https://&lt;host&gt;/api/ingest --api-key &lt;key&gt;</code>
      </p>
    </div>
  );
}
