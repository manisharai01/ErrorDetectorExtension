// Plain-node smoke tests for the @ied/cli command surface. Assumes dist/ exists
// (run `tsc -b` first). Spawns the real bin and asserts on real output.
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliDir = path.resolve(__dirname, '..');
const bin = path.join(cliDir, 'bin', 'ied.js');

let passed = 0;
let failed = 0;
const cleanup = [];

function ok(name) {
  passed++;
  console.log(`ok   - ${name}`);
}
function fail(name, err) {
  failed++;
  console.log(`FAIL - ${name}`);
  console.log('       ' + (err && err.stack ? err.stack.split('\n').join('\n       ') : String(err)));
}
function test(name, fn) {
  try {
    fn();
    ok(name);
  } catch (err) {
    fail(name, err);
  }
}

// Run the bin. `scan` exits 1 when errors are found, which execFileSync treats
// as a throw; recover stdout from the error object so format tests still work.
function run(args, cwd) {
  try {
    return execFileSync('node', [bin, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    if (err && typeof err.stdout === 'string') return err.stdout;
    throw err;
  }
}

// A fixture with guaranteed findings: eval() (error, IED-S002) + console.log
// (warning, IED-Q001).
const FIXTURE_SRC = 'function run(userInput) {\n  eval(userInput);\n  console.log(userInput);\n}\n';

function makeFixtureDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ied-fixture-'));
  cleanup.push(dir);
  fs.writeFileSync(path.join(dir, 'sample.js'), FIXTURE_SRC);
  return dir;
}

const fixtureDir = makeFixtureDir();

// --- format tests ---
test('scan --format json -> parses as JSON', () => {
  const out = run(['scan', fixtureDir, '--format', 'json', '--no-cache'], cliDir);
  JSON.parse(out);
});

test('scan --format sarif -> parses and version 2.1.0', () => {
  const out = run(['scan', fixtureDir, '--format', 'sarif', '--no-cache'], cliDir);
  const sarif = JSON.parse(out);
  if (sarif.version !== '2.1.0') throw new Error(`expected sarif version 2.1.0, got ${sarif.version}`);
});

test('scan --format junit -> contains <testsuite', () => {
  const out = run(['scan', fixtureDir, '--format', 'junit', '--no-cache'], cliDir);
  if (!out.includes('<testsuite')) throw new Error('junit output missing <testsuite');
});

// --- init test ---
test('init writes .iedrc.json in a temp dir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ied-init-'));
  cleanup.push(dir);
  run(['init'], dir);
  const cfg = path.join(dir, '.iedrc.json');
  if (!fs.existsSync(cfg)) throw new Error('.iedrc.json was not written');
  const parsed = JSON.parse(fs.readFileSync(cfg, 'utf8'));
  if (!parsed.rules || !parsed.baseline) throw new Error('config missing expected keys');
});

// --- baseline test ---
test('baseline then scan --baseline hides findings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ied-baseline-'));
  cleanup.push(dir);
  fs.writeFileSync(path.join(dir, 'sample.js'), FIXTURE_SRC);

  // Findings before baseline.
  const before = JSON.parse(run(['scan', dir, '--format', 'json', '--no-cache'], dir)).diagnostics;
  if (!Array.isArray(before) || before.length === 0) {
    throw new Error('fixture produced no findings to baseline');
  }

  // Write the baseline.
  const baseOut = run(['baseline', dir], dir);
  if (!/Wrote baseline with \d+ fingerprints/.test(baseOut)) {
    throw new Error('baseline command did not report writing fingerprints: ' + baseOut);
  }
  if (!fs.existsSync(path.join(dir, '.ied-baseline.json'))) {
    throw new Error('.ied-baseline.json not written');
  }

  // After baseline: JSON findings should be empty (all hidden).
  const after = JSON.parse(run(['scan', dir, '--format', 'json', '--baseline', '.ied-baseline.json', '--no-cache'], dir)).diagnostics;
  if (after.length !== 0) {
    throw new Error(`expected 0 findings after baseline, got ${after.length}`);
  }

  // Terminal format reports the hidden count.
  const term = run(['scan', dir, '--baseline', '.ied-baseline.json', '--no-cache'], dir);
  if (!/findings hidden by baseline/.test(term)) {
    throw new Error('scan did not report findings hidden by baseline: ' + term);
  }
});

// --- cleanup ---
for (const dir of cleanup) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
