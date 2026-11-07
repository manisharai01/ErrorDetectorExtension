/**
 * Performance benchmark — two checks, both enforced:
 *
 *   1. TYPICAL-FILE SLA: a ~2,000-line file analyzed under TYPICAL_BUDGET_MS.
 *      This reflects real-world usage (most files are well under a few
 *      thousand lines).
 *
 *   2. SPEC TARGET: a ~50,000-line file analyzed under LARGE_BUDGET_MS (the
 *      spec's "50k lines < 2s"). It also catches O(n²) regressions like the old
 *      per-diagnostic `source.split('\n')` bug (which made this ~52s).
 *
 * The engine meets the 2s target because rules no longer walk the tree
 * themselves: the analyzer collects every node type the rules declare in ONE
 * native traversal (`NodeIndex`) and rules read their slice via
 * `ctx.nodesOfType`. Before that, each rule was its own JS walk (~100ms per
 * rule per 50k lines) and this file took ~4–6s.
 *
 * Slower machines can relax the budgets with IED_BENCH_TYPICAL_MS /
 * IED_BENCH_LARGE_MS.
 */

import { Analyzer } from '../../src/engine/analyzer';
import { registerAllRules } from '../../src/rules/index';
import { defaultResolvedConfig } from '../../src/config/resolve';

const TYPICAL_LINES = 2_000;
const TYPICAL_BUDGET_MS = Number(process.env.IED_BENCH_TYPICAL_MS) || 800; // real-world SLA
const LARGE_LINES = 50_000;
const LARGE_BUDGET_MS = Number(process.env.IED_BENCH_LARGE_MS) || 2_000; // spec: 50k lines < 2s
const ITERATIONS = 5;

/** A varied block touching several rule categories; ~11 lines each. */
function block(i: number): string {
  return `
function compute_${i}(a, b, unusedParam) {
  // TODO: revisit this calculation
  console.log('computing', a, b);
  const factor = 86400;
  const arr = [a, b, factor];
  const first = arr[0];
  const total = a * factor + b;
  return total + first;
}
`;
}

function synthesize(targetLines: number): string {
  const parts: string[] = [];
  let lines = 0;
  let i = 0;
  while (lines < targetLines) {
    const b = block(i++);
    parts.push(b);
    lines += b.split('\n').length;
  }
  return parts.join('\n');
}

function p95(durations: number[]): number {
  const sorted = [...durations].sort((a, b) => a - b);
  const idx = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

async function measure(label: string, content: string): Promise<number> {
  const analyzer = new Analyzer(defaultResolvedConfig(process.cwd()));
  await analyzer.analyzeFile({ filePath: 'bench.js', content }); // warm up (loads WASM grammar)

  const durations: number[] = [];
  let diagnostics = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    const start = process.hrtime.bigint();
    const r = await analyzer.analyzeFile({ filePath: 'bench.js', content });
    durations.push(Number(process.hrtime.bigint() - start) / 1e6);
    diagnostics = r.diagnostics.length;
  }
  analyzer.dispose();

  const lines = content.split('\n').length;
  const result = p95(durations);
  console.log(
    `  ${label}: ${lines.toLocaleString()} lines, P95 ${result.toFixed(0)} ms ` +
      `(${diagnostics.toLocaleString()} diagnostics, ${(result / (lines / 1000)).toFixed(1)} ms/1k lines)`
  );
  return result;
}

async function main(): Promise<void> {
  registerAllRules();

  console.log('IED performance benchmark');
  const typical = await measure('typical', synthesize(TYPICAL_LINES));
  const large = await measure('large  ', synthesize(LARGE_LINES));

  let failed = false;
  if (typical > TYPICAL_BUDGET_MS) {
    console.log(`FAIL: typical-file P95 ${typical.toFixed(0)}ms exceeds SLA ${TYPICAL_BUDGET_MS}ms`);
    failed = true;
  }
  if (large > LARGE_BUDGET_MS) {
    console.log(`FAIL: 50k-line P95 ${large.toFixed(0)}ms exceeds the spec target ${LARGE_BUDGET_MS}ms`);
    failed = true;
  }

  if (failed) {
    process.exit(1);
  }
  console.log(
    `PASS (typical ${typical.toFixed(0)}ms < ${TYPICAL_BUDGET_MS}ms; ` +
      `50k lines ${large.toFixed(0)}ms < ${LARGE_BUDGET_MS}ms spec target)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
