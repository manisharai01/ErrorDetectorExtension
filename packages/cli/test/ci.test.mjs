// CI integration checks: YAML template sanity + ci-comment dry-run.
// Run: node test/ci.test.mjs   (assumes packages/cli is built to dist/)
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const bin = path.join(repoRoot, 'packages', 'cli', 'bin', 'ied.js');

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log('  ok   -', name);
    passed++;
  } catch (err) {
    console.error('  FAIL -', name, '\n        ', err.message);
    failed++;
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

// 1. GitHub workflow template sanity.
check('.github/workflows/ied.yml has expected keys', () => {
  const y = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'ied.yml'), 'utf8');
  assert(y.length > 0, 'empty file');
  assert(y.includes('jobs:'), "missing 'jobs:'");
  assert(y.includes('ied scan'), "missing 'ied scan'");
  assert(y.includes('upload-sarif'), "missing 'upload-sarif'");
});

// 2. GitLab template sanity.
check('.gitlab-ci.yml has expected keys', () => {
  const y = fs.readFileSync(path.join(repoRoot, '.gitlab-ci.yml'), 'utf8');
  assert(y.length > 0, 'empty file');
  assert(y.includes('ied scan'), "missing 'ied scan'");
  assert(y.includes('junit:'), "missing 'junit:' report");
});

// 3. ci-comment dry-run prints markdown with findings.
check('ci-comment --dry-run prints findings markdown', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ied-ci-'));
  try {
    fs.writeFileSync(
      path.join(tmp, 'bad.js'),
      'const k = "AKIAIOSFODNN7EXAMPLE12";\nconsole.log(k);\n'
    );
    // ci-comment exits 1 when error-severity findings exist (the CI gate), so
    // capture stdout regardless of exit code.
    let out;
    try {
      out = execFileSync('node', [bin, 'ci-comment', tmp, '--dry-run'], {
        encoding: 'utf8',
        cwd: tmp
      });
    } catch (err) {
      out = (err.stdout ?? '').toString();
    }
    assert(out.includes('Invisible Errors Detector'), 'missing header');
    assert(out.includes('IED-S001'), 'missing IED-S001 finding');
    assert(out.includes('new finding'), 'missing summary line');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
