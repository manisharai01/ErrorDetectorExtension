import { groupByFile } from '@ied/core';
import type { Diagnostic, Severity } from '@ied/core';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';

function color(code: string, text: string): string {
  return code + text + RESET;
}

function severityColor(sev: Severity | string): string {
  switch (sev) {
    case 'error':
      return color(RED, String(sev));
    case 'warning':
      return color(YELLOW, String(sev));
    case 'info':
      return color(CYAN, String(sev));
    default:
      return color(GRAY, String(sev));
  }
}

/**
 * Print diagnostics grouped by file. Accepts either a pre-grouped Map or a flat
 * array of diagnostics.
 */
export function printResults(input: Map<string, Diagnostic[]> | Diagnostic[]): void {
  const byFile = input instanceof Map ? input : groupByFile(input);
  for (const [file, diags] of byFile) {
    process.stdout.write(color(BOLD, file) + '\n');
    for (const d of diags) {
      const line = d.range.start.row + 1;
      const col = d.range.start.column + 1;
      const loc = color(GRAY, `${line}:${col}`);
      const sev = severityColor(d.severity);
      const rule = color(GRAY, d.ruleId);
      process.stdout.write(`  ${loc}  ${sev}  ${rule}  ${d.message}\n`);
    }
    process.stdout.write('\n');
  }
}

export interface SummaryStats {
  error: number;
  warning: number;
  info: number;
  total: number;
  files: number;
  cached: number;
  elapsed: number;
}

export function printSummary(stats: SummaryStats): void {
  const head =
    stats.error > 0
      ? color(RED, `✖ ${stats.error} errors, ${stats.warning} warnings, ${stats.info} info across ${stats.files} files`)
      : color(GREEN, `✔ ${stats.error} errors, ${stats.warning} warnings, ${stats.info} info across ${stats.files} files`);
  process.stdout.write(head + '\n');
  process.stdout.write(
    color(GRAY, `Analysis completed in ${stats.elapsed}ms (${stats.files} files scanned, ${stats.cached} cached)`) + '\n',
  );
}
