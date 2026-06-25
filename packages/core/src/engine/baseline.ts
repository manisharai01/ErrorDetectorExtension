/**
 * Baseline system. A baseline records the fingerprints of diagnostics that were
 * present at a point in time, so future runs can suppress those "known" findings
 * and surface only new ones — the standard "ratchet" workflow for adopting a
 * linter on a legacy codebase.
 */

import * as fs from 'fs';
import type { Diagnostic } from '../rules/types';

export interface Baseline {
  version: string;
  generatedAt: string | null;
  fingerprints: string[];
}

/**
 * Build a baseline from diagnostics (deduped, sorted fingerprints). `generatedAt`
 * is null for determinism; callers may stamp it before writing.
 */
export function generateBaseline(diagnostics: Diagnostic[]): Baseline {
  const fingerprints = [...new Set(diagnostics.map((d) => d.fingerprint))].sort();
  return { version: '1', generatedAt: null, fingerprints };
}

export function writeBaseline(filePath: string, baseline: Baseline): void {
  fs.writeFileSync(filePath, JSON.stringify(baseline, null, 2), 'utf8');
}

export function loadBaseline(filePath: string): Baseline | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Baseline;
  } catch {
    return null;
  }
}

/** Return only diagnostics whose fingerprint is NOT in the baseline. */
export function filterAgainstBaseline(diagnostics: Diagnostic[], baseline: Baseline): Diagnostic[] {
  const known = new Set(baseline.fingerprints);
  return diagnostics.filter((d) => !known.has(d.fingerprint));
}
