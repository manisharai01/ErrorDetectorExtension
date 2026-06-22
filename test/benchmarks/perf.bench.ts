/**
 * Performance benchmark — synthesises a 50K-line file and measures
 * end-to-end analysis time. Asserts the 95th-percentile run < 2 seconds.
 */
import { runAnalysisInline } from '../../src/workers/inline-runner';

function synth(loc: number): string {
  const block = `
function f$N(arr) {
  for (let i = 0; i <= arr.length; i++) { console.log(arr[i]); }
  const x = 42;
  return arr[arr.length];
}`;
  let out = '';
  let i = 0;
  while (out.split('\n').length < loc) { out += block.replace('$N', String(i++)); }
  return out;
}

const ITER = 5;
const source = synth(50_000);
const filePath = '/synthetic/big.ts';
const samples: number[] = [];

for (let i = 0; i < ITER; i++) {
  const start = process.hrtime.bigint();
  runAnalysisInline({
    id: 0, filePath, sourceText: source, language: 'ts',
    isTestFile: false, ruleSeverities: {}, options: { anyTypeThreshold: 5, allowConsoleInCli: true }
  });
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  samples.push(ms);
  console.log(`run ${i + 1}: ${ms.toFixed(0)} ms`);
}

samples.sort((a, b) => a - b);
const p95 = samples[Math.floor(0.95 * (samples.length - 1))];
console.log(`p95: ${p95.toFixed(0)} ms over ${samples.length} runs`);
if (p95 > 2000) { console.error('FAIL: p95 exceeds 2000 ms'); process.exit(1); }
console.log('OK');
