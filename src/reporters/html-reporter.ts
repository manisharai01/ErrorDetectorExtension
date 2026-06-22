import { Issue } from '../rules-engine/types';
import { Metrics } from '../core/metrics';

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function toHtml(issues: Issue[], metrics?: Metrics): string {
  const byFile = new Map<string, Issue[]>();
  for (const i of issues) {
    const list = byFile.get(i.filePath) ?? [];
    list.push(i); byFile.set(i.filePath, list);
  }
  const totals = metrics?.totalsBySeverity() ?? { error: 0, warning: 0, info: 0 };
  const score = metrics?.qualityScore() ?? 100;

  const fileSections = [...byFile.entries()].map(([file, list]) => `
    <details open><summary><b>${escape(file)}</b> — ${list.length} issue(s)</summary>
      <table>
        <thead><tr><th>Sev</th><th>Rule</th><th>Line</th><th>Message</th></tr></thead>
        <tbody>
          ${list.map(i => `<tr class="${i.severity}">
            <td>${i.severity}</td>
            <td><code>${escape(i.ruleId)}</code></td>
            <td>${i.location.startLine}:${i.location.startCol}</td>
            <td>${escape(i.message)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </details>`).join('\n');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Invisible Errors Report</title>
<style>
  body { font-family: -apple-system, Segoe UI, sans-serif; margin: 24px; color: #222; }
  h1 { margin: 0 0 8px; }
  .score { font-size: 48px; font-weight: 700; color: ${score >= 80 ? '#2a7' : score >= 60 ? '#c80' : '#c33'}; }
  .summary { display:flex; gap:24px; margin: 16px 0 24px; }
  .badge { padding: 6px 12px; border-radius: 12px; background: #eee; }
  .error { background: #fde7e9; }
  .warning { background: #fff5d6; }
  .info { background: #e7f1fd; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  th, td { padding: 6px 10px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
  details { margin-bottom: 12px; }
  code { background: #f4f4f4; padding: 1px 4px; border-radius: 4px; }
</style></head><body>
  <h1>Invisible Errors Report</h1>
  <div class="summary">
    <div><div class="score">${score}</div><div>Quality score</div></div>
    <div><span class="badge error">Errors: ${totals.error}</span></div>
    <div><span class="badge warning">Warnings: ${totals.warning}</span></div>
    <div><span class="badge info">Info: ${totals.info}</span></div>
    <div><span class="badge">Total issues: ${issues.length}</span></div>
  </div>
  ${fileSections || '<p>No issues found. 🎉</p>'}
</body></html>`;
}
