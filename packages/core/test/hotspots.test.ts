/** Predictive bug hotspots: risk ranking from churn × finding weight. */
import * as assert from 'assert';
import { test } from './harness';
import { computeHotspots, findingWeightByFile, SEVERITY_WEIGHT } from '../src/engine/hotspots';

test('hotspots: a file high on both axes outranks one-dimensional files', async () => {
  const result = computeHotspots({
    churn: { 'hot.ts': 50, 'churny.ts': 50, 'buggy.ts': 1, 'calm.ts': 1 },
    findingWeight: { 'hot.ts': 20, 'churny.ts': 0, 'buggy.ts': 20, 'calm.ts': 0 }
  });
  assert.equal(result[0].file, 'hot.ts', 'the both-high file should rank first');
  // churny.ts (no findings) and calm.ts (no churn, no findings) score 0 risk.
  const byFile = Object.fromEntries(result.map((h) => [h.file, h.risk]));
  assert.equal(byFile['churny.ts'], 0, 'churn without findings is not a hotspot');
  assert.ok(byFile['hot.ts'] > byFile['buggy.ts'], 'more churn breaks the tie toward hot.ts');
});

test('hotspots: risk is 0 when either axis is 0 (geometric mean)', async () => {
  const result = computeHotspots({
    churn: { 'a.ts': 0, 'b.ts': 10 },
    findingWeight: { 'a.ts': 10, 'b.ts': 0 }
  });
  for (const h of result) assert.equal(h.risk, 0, `${h.file} should have 0 risk`);
});

test('hotspots: risk is bounded 0..100 and the top file is ~100', async () => {
  const result = computeHotspots({
    churn: { top: 100, mid: 10 },
    findingWeight: { top: 100, mid: 10 }
  });
  assert.equal(result[0].file, 'top');
  assert.equal(result[0].risk, 100, 'the max-on-both file normalizes to 100');
  for (const h of result) {
    assert.ok(h.risk >= 0 && h.risk <= 100, `${h.file} risk out of range: ${h.risk}`);
  }
});

test('hotspots: a single huge outlier does not flatten everyone (log scaling)', async () => {
  const result = computeHotspots({
    churn: { generated: 5000, real: 40 },
    findingWeight: { generated: 1, real: 30 }
  });
  const byFile = Object.fromEntries(result.map((h) => [h.file, h.risk]));
  // Despite 'generated' having 100x the churn, 'real' (high on both) should win.
  assert.ok(byFile['real'] > byFile['generated'], 'log scaling keeps the real hotspot on top');
});

test('hotspots: minRisk and limit options filter the output', async () => {
  const input = {
    churn: { a: 100, b: 50, c: 10, d: 1 },
    findingWeight: { a: 100, b: 20, c: 2, d: 50 }
  };
  const all = computeHotspots(input);
  const limited = computeHotspots(input, { limit: 2 });
  assert.equal(limited.length, 2, 'limit caps the result count');
  assert.deepEqual(
    limited.map((h) => h.file),
    all.slice(0, 2).map((h) => h.file),
    'limit keeps the highest-risk files'
  );
  const filtered = computeHotspots(input, { minRisk: 1 });
  assert.ok(filtered.every((h) => h.risk >= 1), 'minRisk drops low-risk files');
});

test('hotspots: empty input yields no hotspots', async () => {
  assert.deepEqual(computeHotspots({ churn: {}, findingWeight: {} }), []);
});

test('findingWeightByFile: severity-weights and sums per file', async () => {
  const weights = findingWeightByFile([
    { filePath: 'x.ts', severity: 'error' },
    { filePath: 'x.ts', severity: 'warning' },
    { filePath: 'y.ts', severity: 'info' },
    { filePath: 'y.ts', severity: 'hint' }
  ]);
  assert.equal(weights['x.ts'], SEVERITY_WEIGHT.error + SEVERITY_WEIGHT.warning); // 3 + 2
  assert.equal(weights['y.ts'], SEVERITY_WEIGHT.info + SEVERITY_WEIGHT.hint); // 1 + 1
});
