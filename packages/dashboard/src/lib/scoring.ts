/**
 * Quality score for the dashboard — same algorithm the CLI/policy gate use:
 *
 *   score = 100 − (errors·5 + warnings·2 + info·0.5) / KLOC   (clamped 0–100)
 *
 * Kept self-contained (no cross-package import) so the dashboard lib builds and
 * tests without the rest of the monorepo.
 */
export interface SeverityCounts {
  errors: number;
  warnings: number;
  infos: number;
}

export function qualityScore(counts: SeverityCounts, loc = 1000): number {
  const kloc = Math.max(1, loc / 1000);
  const penalty = (counts.errors * 5 + counts.warnings * 2 + counts.infos * 0.5) / kloc;
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}
