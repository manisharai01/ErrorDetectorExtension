/**
 * Output reporters. Pure functions from resolved `Diagnostic[]` to a string in
 * a given format. Shared by @ied/cli (file output) and @ied/vscode (export +
 * dashboard). No external dependencies; no I/O.
 */

import type { Diagnostic, Severity } from '../rules/types';
import { registry } from '../rules/registry';

export interface Summary {
  error: number;
  warning: number;
  info: number;
  hint: number;
  total: number;
  files: number;
}

/** Count diagnostics by severity and distinct file. */
export function summarize(diagnostics: Diagnostic[]): Summary {
  const s: Summary = { error: 0, warning: 0, info: 0, hint: 0, total: diagnostics.length, files: 0 };
  const files = new Set<string>();
  for (const d of diagnostics) {
    files.add(d.filePath);
    if (d.severity === 'error') s.error++;
    else if (d.severity === 'warning') s.warning++;
    else if (d.severity === 'info') s.info++;
    else if (d.severity === 'hint') s.hint++;
  }
  s.files = files.size;
  return s;
}

/** Group diagnostics by file path, preserving insertion order. */
export function groupByFile(diagnostics: Diagnostic[]): Map<string, Diagnostic[]> {
  const byFile = new Map<string, Diagnostic[]>();
  for (const d of diagnostics) {
    const list = byFile.get(d.filePath) ?? [];
    list.push(d);
    byFile.set(d.filePath, list);
  }
  return byFile;
}

/**
 * A heuristic 0–100 quality score from severity counts (no LOC needed).
 * Errors are penalised most. Callers with LOC data can pass their own score.
 */
export function qualityScore(diagnostics: Diagnostic[]): number {
  const s = summarize(diagnostics);
  const weighted = s.error * 10 + s.warning * 3 + s.info * 1;
  const denom = Math.max(1, s.files) * 12;
  return Math.max(0, Math.round(100 - (weighted / denom) * 100));
}

// ── JSON ─────────────────────────────────────────────────────────────────────

export function toJson(diagnostics: Diagnostic[]): string {
  return JSON.stringify(
    {
      schema: 'ied/v1',
      generatedAt: null, // stamp at write time if needed; kept deterministic here
      summary: summarize(diagnostics),
      diagnostics
    },
    null,
    2
  );
}

// ── SARIF 2.1.0 ──────────────────────────────────────────────────────────────

const SARIF_LEVEL: Record<Severity, string> = {
  error: 'error',
  warning: 'warning',
  info: 'note',
  hint: 'note'
};

export function toSarif(diagnostics: Diagnostic[]): string {
  const ruleIds = [...new Set(diagnostics.map((d) => d.ruleId))];
  const rules = ruleIds.map((id) => {
    const r = registry.get(id);
    return {
      id,
      name: r?.name ?? id,
      shortDescription: { text: r?.description ?? id },
      fullDescription: { text: r?.docs ?? r?.description ?? '' },
      defaultConfiguration: { level: SARIF_LEVEL[r?.severity ?? ('warning' as Severity)] },
      properties: { category: r?.category }
    };
  });

  const results = diagnostics.map((d) => ({
    ruleId: d.ruleId,
    level: SARIF_LEVEL[d.severity],
    message: { text: d.message },
    partialFingerprints: { iedFingerprint: d.fingerprint },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: d.filePath.replace(/\\/g, '/') },
          // SARIF regions are 1-based; Tree-sitter rows/cols are 0-based.
          region: {
            startLine: d.range.start.row + 1,
            startColumn: d.range.start.column + 1,
            endLine: d.range.end.row + 1,
            endColumn: d.range.end.column + 1
          }
        }
      }
    ]
  }));

  return JSON.stringify(
    {
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'Invisible Errors Detector',
              version: '0.1.0',
              informationUri: 'https://example.invalid/ied',
              rules
            }
          },
          results
        }
      ]
    },
    null,
    2
  );
}

// ── JUnit XML ────────────────────────────────────────────────────────────────

const xmlEscape = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));

export function toJUnit(diagnostics: Diagnostic[]): string {
  const byFile = groupByFile(diagnostics);
  const suites = [...byFile.entries()]
    .map(([file, diags]) => {
      const cases = diags
        .map((d) => {
          const name = `${d.ruleId} ${d.range.start.row + 1}:${d.range.start.column + 1}`;
          return (
            `    <testcase classname="${xmlEscape(file)}" name="${xmlEscape(name)}">\n` +
            `      <failure message="${xmlEscape(d.message)}" type="${xmlEscape(d.severity)}"/>\n` +
            `    </testcase>`
          );
        })
        .join('\n');
      return (
        `  <testsuite name="${xmlEscape(file)}" tests="${diags.length}" failures="${diags.length}">\n` +
        `${cases}\n` +
        `  </testsuite>`
      );
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n${suites}\n</testsuites>\n`;
}

// ── HTML dashboard ───────────────────────────────────────────────────────────

const htmlEscape = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export interface HtmlOptions {
  /** Override the computed quality score (e.g. VS Code passes a LOC-based one). */
  score?: number;
  title?: string;
}

export function toHtml(diagnostics: Diagnostic[], opts: HtmlOptions = {}): string {
  const s = summarize(diagnostics);
  const score = opts.score ?? qualityScore(diagnostics);
  const title = opts.title ?? 'Invisible Errors Report';
  const byFile = groupByFile(diagnostics);

  const scoreColor = score >= 80 ? '#2a7' : score >= 60 ? '#c80' : '#c33';

  const fileSections = [...byFile.entries()]
    .sort(([, a], [, b]) => b.length - a.length)
    .map(
      ([file, list]) => `
    <details open><summary><b>${htmlEscape(file)}</b> — ${list.length} issue(s)</summary>
      <table>
        <thead><tr><th>Sev</th><th>Rule</th><th>Line</th><th>Message</th></tr></thead>
        <tbody>
          ${list
            .map(
              (d) => `<tr class="${d.severity}">
            <td>${d.severity}</td>
            <td><code>${htmlEscape(d.ruleId)}</code></td>
            <td>${d.range.start.row + 1}:${d.range.start.column + 1}</td>
            <td>${htmlEscape(d.message)}</td>
          </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </details>`
    )
    .join('\n');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${htmlEscape(title)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, sans-serif; margin: 24px; color: #222; }
  h1 { margin: 0 0 8px; }
  .score { font-size: 48px; font-weight: 700; color: ${scoreColor}; }
  .summary { display:flex; gap:24px; margin: 16px 0 24px; align-items: flex-end; }
  .badge { padding: 6px 12px; border-radius: 12px; background: #eee; }
  tr.error td { background: #fde7e9; }
  tr.warning td { background: #fff5d6; }
  tr.info td { background: #e7f1fd; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  th, td { padding: 6px 10px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
  details { margin-bottom: 12px; }
  code { background: #f4f4f4; padding: 1px 4px; border-radius: 4px; }
</style></head><body>
  <h1>${htmlEscape(title)}</h1>
  <div class="summary">
    <div><div class="score">${score}</div><div>Quality score</div></div>
    <div><span class="badge error">Errors: ${s.error}</span></div>
    <div><span class="badge warning">Warnings: ${s.warning}</span></div>
    <div><span class="badge info">Info: ${s.info}</span></div>
    <div><span class="badge">Total: ${s.total}</span></div>
  </div>
  ${fileSections || '<p>No issues found. 🎉</p>'}
</body></html>`;
}
