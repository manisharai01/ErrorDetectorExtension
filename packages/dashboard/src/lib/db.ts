/**
 * SQLite-backed store for ingested scan results (better-sqlite3).
 *
 * One `scans` row per ingested run (with its severity counts + score) and one
 * `findings` row per finding. "Current state" queries use the latest scan per
 * repo; trend queries walk scans over time. False positives are tracked by
 * fingerprint so rule analytics can compute an FP rate.
 *
 * `DashboardStore` is storage logic only (no Next.js) so it is unit-testable
 * against an in-memory database.
 */
import Database from 'better-sqlite3';
import * as path from 'path';
import { qualityScore } from './scoring';

export type Severity = 'error' | 'warning' | 'info' | 'hint';

export interface IngestMetadata {
  repo: string;
  branch?: string;
  commit?: string;
  team?: string;
  timestamp: string;
  loc?: number;
}

export interface NormalizedFinding {
  ruleId: string;
  severity: Severity;
  message: string;
  filePath: string;
  line: number;
  column?: number;
  fingerprint?: string;
}

export interface RepoSummary {
  repo: string;
  team: string | null;
  score: number;
  errors: number;
  warnings: number;
  infos: number;
  total: number;
  lastScan: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo TEXT NOT NULL,
  branch TEXT,
  commit_sha TEXT,
  team TEXT,
  ts TEXT NOT NULL,
  errors INTEGER NOT NULL,
  warnings INTEGER NOT NULL,
  infos INTEGER NOT NULL,
  loc INTEGER NOT NULL DEFAULT 1000,
  score INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id INTEGER NOT NULL,
  repo TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  file_path TEXT NOT NULL,
  line INTEGER NOT NULL,
  col INTEGER,
  fingerprint TEXT
);
CREATE TABLE IF NOT EXISTS false_positives (
  fingerprint TEXT PRIMARY KEY,
  rule_id TEXT,
  marked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scans_repo_ts ON scans(repo, ts);
CREATE INDEX IF NOT EXISTS idx_findings_scan ON findings(scan_id);
`;

export class DashboardStore {
  constructor(private readonly db: Database.Database) {
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  /** Store one scan and its findings; returns the new scan id + computed score. */
  ingest(meta: IngestMetadata, findings: NormalizedFinding[]): { scanId: number; score: number } {
    const errors = findings.filter((f) => f.severity === 'error').length;
    const warnings = findings.filter((f) => f.severity === 'warning').length;
    const infos = findings.filter((f) => f.severity === 'info' || f.severity === 'hint').length;
    const loc = meta.loc ?? 1000;
    const score = qualityScore({ errors, warnings, infos }, loc);

    const tx = this.db.transaction(() => {
      const scanId = this.db
        .prepare(
          `INSERT INTO scans (repo, branch, commit_sha, team, ts, errors, warnings, infos, loc, score)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          meta.repo,
          meta.branch ?? null,
          meta.commit ?? null,
          meta.team ?? null,
          meta.timestamp,
          errors,
          warnings,
          infos,
          loc,
          score
        ).lastInsertRowid as number;

      const insert = this.db.prepare(
        `INSERT INTO findings (scan_id, repo, rule_id, severity, message, file_path, line, col, fingerprint)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const f of findings) {
        insert.run(
          scanId,
          meta.repo,
          f.ruleId,
          f.severity,
          f.message,
          f.filePath,
          f.line,
          f.column ?? null,
          f.fingerprint ?? null
        );
      }
      return scanId;
    });

    const scanId = tx();
    return { scanId, score };
  }

  /** Latest scan id per repo. */
  private latestScanId(repo: string): number | null {
    const row = this.db
      .prepare(`SELECT id FROM scans WHERE repo = ? ORDER BY ts DESC, id DESC LIMIT 1`)
      .get(repo) as { id: number } | undefined;
    return row?.id ?? null;
  }

  listRepos(): RepoSummary[] {
    const repos = this.db.prepare(`SELECT DISTINCT repo FROM scans`).all() as { repo: string }[];
    return repos
      .map(({ repo }) => {
        const scan = this.db
          .prepare(`SELECT * FROM scans WHERE repo = ? ORDER BY ts DESC, id DESC LIMIT 1`)
          .get(repo) as any;
        return {
          repo,
          team: scan.team ?? null,
          score: scan.score,
          errors: scan.errors,
          warnings: scan.warnings,
          infos: scan.infos,
          total: scan.errors + scan.warnings + scan.infos,
          lastScan: scan.ts
        } as RepoSummary;
      })
      .sort((a, b) => b.total - a.total);
  }

  orgOverview(trendDays = 30): {
    errors: number;
    warnings: number;
    infos: number;
    total: number;
    score: number;
    repoCount: number;
    topRepos: RepoSummary[];
    trend: { date: string; total: number }[];
  } {
    const repos = this.listRepos();
    const errors = repos.reduce((n, r) => n + r.errors, 0);
    const warnings = repos.reduce((n, r) => n + r.warnings, 0);
    const infos = repos.reduce((n, r) => n + r.infos, 0);
    const score = repos.length ? Math.round(repos.reduce((n, r) => n + r.score, 0) / repos.length) : 100;

    // Trend: total findings of the latest scan per repo per day, last N days.
    const trend = this.db
      .prepare(
        `SELECT substr(ts, 1, 10) AS date, SUM(errors + warnings + infos) AS total
         FROM scans
         GROUP BY date
         ORDER BY date DESC
         LIMIT ?`
      )
      .all(trendDays) as { date: string; total: number }[];

    return {
      errors,
      warnings,
      infos,
      total: errors + warnings + infos,
      score,
      repoCount: repos.length,
      topRepos: repos.slice(0, 5),
      trend: trend.reverse()
    };
  }

  repoFindings(repo: string): NormalizedFinding[] {
    const scanId = this.latestScanId(repo);
    if (scanId === null) return [];
    const rows = this.db
      .prepare(`SELECT rule_id, severity, message, file_path, line, col, fingerprint FROM findings WHERE scan_id = ?`)
      .all(scanId) as any[];
    return rows.map((r) => ({
      ruleId: r.rule_id,
      severity: r.severity,
      message: r.message,
      filePath: r.file_path,
      line: r.line,
      column: r.col ?? undefined,
      fingerprint: r.fingerprint ?? undefined
    }));
  }

  fileFindings(repo: string, filePath: string): NormalizedFinding[] {
    return this.repoFindings(repo).filter((f) => f.filePath === filePath);
  }

  repoTrend(repo: string, limit = 30): { ts: string; score: number; total: number }[] {
    const rows = this.db
      .prepare(
        `SELECT ts, score, (errors + warnings + infos) AS total
         FROM scans WHERE repo = ? ORDER BY ts DESC, id DESC LIMIT ?`
      )
      .all(repo, limit) as any[];
    return rows.reverse();
  }

  ruleAnalytics(): {
    ruleId: string;
    count: number;
    falsePositives: number;
    fpRate: number;
  }[] {
    // Occurrences across each repo's latest scan only.
    const latestIds = (this.db.prepare(`SELECT repo FROM scans GROUP BY repo`).all() as { repo: string }[])
      .map((r) => this.latestScanId(r.repo))
      .filter((x): x is number => x !== null);
    if (latestIds.length === 0) return [];
    const placeholders = latestIds.map(() => '?').join(',');
    const counts = this.db
      .prepare(`SELECT rule_id, COUNT(*) AS count FROM findings WHERE scan_id IN (${placeholders}) GROUP BY rule_id`)
      .all(...latestIds) as { rule_id: string; count: number }[];
    const fpRows = this.db
      .prepare(`SELECT rule_id, COUNT(*) AS fp FROM false_positives GROUP BY rule_id`)
      .all() as { rule_id: string; fp: number }[];
    const fpByRule = new Map(fpRows.map((r) => [r.rule_id, r.fp]));
    return counts
      .map((c) => {
        const fp = fpByRule.get(c.rule_id) ?? 0;
        return { ruleId: c.rule_id, count: c.count, falsePositives: fp, fpRate: c.count ? fp / c.count : 0 };
      })
      .sort((a, b) => b.count - a.count);
  }

  markFalsePositive(fingerprint: string, ruleId: string | undefined, markedAt: string): void {
    this.db
      .prepare(`INSERT OR REPLACE INTO false_positives (fingerprint, rule_id, marked_at) VALUES (?, ?, ?)`)
      .run(fingerprint, ruleId ?? null, markedAt);
  }

  teamView(): { team: string; repoCount: number; avgScore: number; total: number }[] {
    const repos = this.listRepos();
    const byTeam = new Map<string, RepoSummary[]>();
    for (const r of repos) {
      const team = r.team ?? 'unassigned';
      const list = byTeam.get(team) ?? [];
      list.push(r);
      byTeam.set(team, list);
    }
    return [...byTeam.entries()]
      .map(([team, list]) => ({
        team,
        repoCount: list.length,
        avgScore: Math.round(list.reduce((n, r) => n + r.score, 0) / list.length),
        total: list.reduce((n, r) => n + r.total, 0)
      }))
      .sort((a, b) => a.avgScore - b.avgScore);
  }
}

let singleton: DashboardStore | null = null;

/** App-wide store singleton (self-hosted, single process). */
export function getStore(): DashboardStore {
  if (!singleton) {
    const dbPath = process.env.IED_DASHBOARD_DB || path.join(process.cwd(), 'ied-dashboard.db');
    singleton = new DashboardStore(new Database(dbPath));
  }
  return singleton;
}

/** Open an isolated store (used by tests, e.g. `openStore(':memory:')`). */
export function openStore(dbPath: string): DashboardStore {
  return new DashboardStore(new Database(dbPath));
}
