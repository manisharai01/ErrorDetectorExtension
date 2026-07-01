/**
 * Predictive bug hotspots.
 *
 * The insight (from the "code as a crime scene" body of work): the files most
 * likely to harbor bugs are the ones that change often AND already show signs
 * of trouble. We approximate "signs of trouble" with IED's own finding density
 * and "changes often" with git churn (commits touching the file).
 *
 *   risk = 100 · sqrt(normalizedChurn · normalizedFindingWeight)
 *
 * The geometric mean rewards files that are high on BOTH axes: a churny file
 * with no findings, or a finding-heavy file nobody touches, scores low; a file
 * that is both is where bugs are predicted to land. Both inputs are log-scaled
 * before normalizing so a single enormous outlier (a generated file with 5,000
 * commits) doesn't flatten everyone else to zero.
 *
 * Pure and dependency-free: callers supply per-file churn and a per-file finding
 * weight (e.g. error·3 + warning·2 + info·1). No git, no engine state here.
 */

export interface HotspotInput {
  /** Commits (or any change-frequency metric) per file path. */
  churn: Record<string, number>;
  /** Finding weight per file path (severity-weighted count works well). */
  findingWeight: Record<string, number>;
}

export interface Hotspot {
  file: string;
  churn: number;
  findingWeight: number;
  /** Normalized 0..1 inputs, exposed for display / debugging. */
  churnNorm: number;
  findingNorm: number;
  /** Combined risk, 0..100, higher = more bug-prone. */
  risk: number;
}

export interface HotspotOptions {
  /** Drop files whose risk is below this (0..100). Default 0 (keep all). */
  minRisk?: number;
  /** Keep at most this many, highest-risk first. Default: all. */
  limit?: number;
}

const log1p = (n: number): number => Math.log(1 + Math.max(0, n));

/**
 * Rank files by predicted bug risk. Files present in either input are
 * considered; a file absent from one map is treated as 0 on that axis (and so
 * scores 0 risk, since the geometric mean of anything with 0 is 0).
 */
export function computeHotspots(input: HotspotInput, opts: HotspotOptions = {}): Hotspot[] {
  const files = new Set<string>([...Object.keys(input.churn), ...Object.keys(input.findingWeight)]);

  // Log-scale first so outliers don't dominate the normalization.
  const churnLog = new Map<string, number>();
  const findLog = new Map<string, number>();
  let maxChurnLog = 0;
  let maxFindLog = 0;
  for (const file of files) {
    const c = log1p(input.churn[file] ?? 0);
    const f = log1p(input.findingWeight[file] ?? 0);
    churnLog.set(file, c);
    findLog.set(file, f);
    if (c > maxChurnLog) maxChurnLog = c;
    if (f > maxFindLog) maxFindLog = f;
  }

  const minRisk = opts.minRisk ?? 0;
  const hotspots: Hotspot[] = [];
  for (const file of files) {
    const churnNorm = maxChurnLog > 0 ? churnLog.get(file)! / maxChurnLog : 0;
    const findingNorm = maxFindLog > 0 ? findLog.get(file)! / maxFindLog : 0;
    const risk = Math.round(100 * Math.sqrt(churnNorm * findingNorm));
    if (risk < minRisk) continue;
    hotspots.push({
      file,
      churn: input.churn[file] ?? 0,
      findingWeight: input.findingWeight[file] ?? 0,
      churnNorm: round2(churnNorm),
      findingNorm: round2(findingNorm),
      risk
    });
  }

  // Highest risk first; ties broken by churn then path for stable output.
  hotspots.sort((a, b) => b.risk - a.risk || b.churn - a.churn || a.file.localeCompare(b.file));

  return opts.limit !== undefined ? hotspots.slice(0, opts.limit) : hotspots;
}

/** Severity weights used to turn raw findings into a per-file finding weight. */
export const SEVERITY_WEIGHT: Record<string, number> = {
  error: 3,
  warning: 2,
  info: 1,
  hint: 1
};

/**
 * Aggregate a flat list of findings into a per-file weighted score using
 * SEVERITY_WEIGHT. Handy for callers that have diagnostics in hand.
 */
export function findingWeightByFile(
  findings: Array<{ filePath: string; severity: string }>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of findings) {
    out[f.filePath] = (out[f.filePath] ?? 0) + (SEVERITY_WEIGHT[f.severity] ?? 1);
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
