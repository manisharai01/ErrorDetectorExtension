/**
 * Lightweight metrics: timings, counters, and a quality score derived from
 * issue density and severity weights. Used by the dashboard webview.
 */
export interface FileMetric {
  filePath: string;
  loc: number;
  durationMs: number;
  issueCount: number;
  errors: number;
  warnings: number;
  infos: number;
}

export class Metrics {
  private files = new Map<string, FileMetric>();
  private autoFixes = 0;
  private startedAt = Date.now();
  private history: { ts: number; total: number }[] = [];

  recordFile(m: FileMetric): void {
    this.files.set(m.filePath, m);
    this.history.push({ ts: Date.now(), total: this.totalIssues() });
    if (this.history.length > 500) this.history.shift();
  }
  recordAutoFix(): void { this.autoFixes++; }

  totalIssues(): number {
    let n = 0; for (const f of this.files.values()) n += f.issueCount; return n;
  }

  totalsBySeverity(): { error: number; warning: number; info: number } {
    let e = 0, w = 0, i = 0;
    for (const f of this.files.values()) { e += f.errors; w += f.warnings; i += f.infos; }
    return { error: e, warning: w, info: i };
  }

  /** 0-100; higher is better. Penalises errors more than warnings/infos. */
  qualityScore(): number {
    let loc = 0, weighted = 0;
    for (const f of this.files.values()) {
      loc += f.loc;
      weighted += f.errors * 10 + f.warnings * 3 + f.infos * 1;
    }
    if (loc === 0) return 100;
    const density = weighted / loc;          // issues per line, weighted
    const score = Math.max(0, 100 - density * 1000);
    return Math.round(score);
  }

  topProblemFiles(n = 10): FileMetric[] {
    return [...this.files.values()].sort((a, b) => b.issueCount - a.issueCount).slice(0, n);
  }

  /**
   * Composite risk score for a single file (higher = riskier).
   *   weighted issues  (errors×10 + warnings×3 + infos×1)
   * + complexity proxy (LOC / 100)
   * + churn factor    (capped at +20 if a churn map is provided)
   */
  riskScore(filePath: string, churnByFile?: Map<string, number>): number {
    const f = this.files.get(filePath);
    if (!f) return 0;
    const weighted = f.errors * 10 + f.warnings * 3 + f.infos;
    const complexity = f.loc / 100;
    const churn = churnByFile ? Math.min(20, churnByFile.get(filePath) ?? 0) : 0;
    return Math.round(weighted + complexity + churn);
  }

  /** Top N risky files, in descending risk score order. */
  topRiskyFiles(n = 5, churnByFile?: Map<string, number>): Array<{ file: FileMetric; risk: number }> {
    return [...this.files.values()]
      .map(file => ({ file, risk: this.riskScore(file.filePath, churnByFile) }))
      .sort((a, b) => b.risk - a.risk)
      .slice(0, n);
  }

  /** Aggregate project health 0–100; complements `qualityScore`. */
  projectHealthScore(): number {
    const totals = this.totalsBySeverity();
    const fileCount = this.files.size || 1;
    const errPenalty = (totals.error / fileCount) * 25;
    const warnPenalty = (totals.warning / fileCount) * 5;
    const infoPenalty = (totals.info / fileCount) * 1;
    return Math.max(0, Math.round(100 - errPenalty - warnPenalty - infoPenalty));
  }

  trend(): { ts: number; total: number }[] { return [...this.history]; }
  autoFixCount(): number { return this.autoFixes; }
  uptimeMs(): number { return Date.now() - this.startedAt; }
  clear(): void { this.files.clear(); this.history = []; this.autoFixes = 0; }
  allFiles(): FileMetric[] { return [...this.files.values()]; }
}
