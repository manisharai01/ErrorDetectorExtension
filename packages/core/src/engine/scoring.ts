/**
 * Quality score, shared by the CLI quality gate, the policy thresholds, and the
 * web dashboard so they all agree.
 *
 *   score = 100 − (errors·5 + warnings·2 + info·0.5) / KLOC
 *
 * clamped to 0–100 and normalized per thousand lines of code (KLOC) so a big
 * codebase isn't punished for sheer size. With no LOC info, KLOC defaults to 1
 * (raw penalty).
 */

export interface FindingCounts {
  errors: number;
  warnings: number;
  infos: number;
}

export function scoreFindings(counts: FindingCounts, loc = 1000): number {
  const kloc = Math.max(1, loc / 1000);
  const penalty = (counts.errors * 5 + counts.warnings * 2 + counts.infos * 0.5) / kloc;
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}
