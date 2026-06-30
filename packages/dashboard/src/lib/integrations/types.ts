/**
 * Integration interfaces. Adding a new connector (Linear, Asana, Teams) means
 * implementing `IssueTracker` and/or `Notifier` — nothing else changes.
 */

export type Severity = 'error' | 'warning' | 'info' | 'hint';

export interface ScanFinding {
  ruleId: string;
  ruleName?: string;
  severity: Severity;
  message: string;
  filePath: string;
  line: number;
  column?: number;
  fingerprint?: string;
}

export interface RepoContext {
  repo: string;
  branch?: string;
  commit?: string;
  /** Platform user id/handle of the commit author (for @mentions). */
  author?: string;
}

export interface QualityGate {
  passed: boolean;
  failures: string[];
  score?: number;
}

export interface Digest {
  repo: string;
  score: number;
  /** Change vs. the previous period (positive = improved). */
  scoreTrend?: number;
  newFindings: number;
  topRules: { ruleId: string; count: number }[];
  periodDays: number;
}

export interface CreatedIssue {
  key: string;
  url: string;
}

/** Issue trackers: create/link/transition tickets from findings (Jira, …). */
export interface IssueTracker {
  readonly name: string;
  createIssueFromFinding(finding: ScanFinding, ctx: RepoContext): Promise<CreatedIssue>;
  /** Pull an existing ticket id out of free text (e.g. a TODO comment). */
  extractIssueRef(text: string): string | null;
  transitionIssue(key: string, toStatus: string): Promise<void>;
}

/** Notifiers: push messages to a channel/webhook (Slack, Teams, …). */
export interface Notifier {
  readonly name: string;
  qualityGateFailed(gate: QualityGate, ctx: RepoContext): Promise<void>;
  weeklyDigest(digest: Digest): Promise<void>;
  securityFindingIntroduced(finding: ScanFinding, ctx: RepoContext): Promise<void>;
}

/** Minimal fetch shape so adapters can be unit-tested with a stub. */
export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<{ ok: boolean; status: number; json(): Promise<any>; text(): Promise<string> }>;
