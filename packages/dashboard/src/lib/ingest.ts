/**
 * Ingest: turn a CLI `--report-to` payload ({ metadata, sarif }) into stored
 * findings. SARIF severities (`error`/`warning`/`note`) map to our severities;
 * `partialFingerprints.iedFingerprint` (emitted by the core SARIF reporter)
 * round-trips so baseline/false-positive matching works.
 */
import type { DashboardStore, IngestMetadata, NormalizedFinding, Severity } from './db';

export interface IngestPayload {
  metadata: {
    repo: string;
    branch?: string;
    commit?: string;
    team?: string;
    timestamp?: string;
    loc?: number;
  };
  sarif: string | Record<string, any>;
}

const LEVEL_TO_SEVERITY: Record<string, Severity> = {
  error: 'error',
  warning: 'warning',
  note: 'info',
  none: 'info'
};

export function parseSarif(sarif: string | Record<string, any>): NormalizedFinding[] {
  const doc = typeof sarif === 'string' ? JSON.parse(sarif) : sarif;
  const findings: NormalizedFinding[] = [];
  for (const run of doc.runs ?? []) {
    for (const result of run.results ?? []) {
      const phys = result.locations?.[0]?.physicalLocation;
      findings.push({
        ruleId: result.ruleId ?? 'unknown',
        severity: LEVEL_TO_SEVERITY[result.level ?? 'warning'] ?? 'warning',
        message: result.message?.text ?? '',
        filePath: phys?.artifactLocation?.uri ?? '',
        line: phys?.region?.startLine ?? 1,
        column: phys?.region?.startColumn,
        fingerprint: result.partialFingerprints?.iedFingerprint
      });
    }
  }
  return findings;
}

export function ingestPayload(
  store: DashboardStore,
  payload: IngestPayload,
  now: string
): { scanId: number; score: number; findingCount: number } {
  if (!payload?.metadata?.repo) {
    throw new Error('ingest payload missing metadata.repo');
  }
  const findings = parseSarif(payload.sarif);
  const meta: IngestMetadata = {
    repo: payload.metadata.repo,
    branch: payload.metadata.branch,
    commit: payload.metadata.commit,
    team: payload.metadata.team,
    timestamp: payload.metadata.timestamp ?? now,
    loc: payload.metadata.loc
  };
  const { scanId, score } = store.ingest(meta, findings);
  return { scanId, score, findingCount: findings.length };
}
