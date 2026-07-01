// Dashboard data-layer tests against an in-memory SQLite db.
// Run: npm run build:lib && node test/db.test.cjs
const { openStore } = require('../dist/lib/db.js');
const { ingestPayload, parseSarif } = require('../dist/lib/ingest.js');
const { ingestHotspotPayload } = require('../dist/lib/ingest-hotspots.js');
const assert = require('assert');

function sarif(results) {
  return JSON.stringify({ version: '2.1.0', runs: [{ tool: { driver: { name: 'IED', rules: [] } }, results }] });
}
function result(ruleId, level, file, line, fp) {
  return {
    ruleId,
    level,
    message: { text: `${ruleId} message` },
    partialFingerprints: fp ? { iedFingerprint: fp } : undefined,
    locations: [{ physicalLocation: { artifactLocation: { uri: file }, region: { startLine: line, startColumn: 1 } } }]
  };
}

let pass = 0,
  fail = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  ok   -', name);
    pass++;
  } catch (e) {
    console.error('  FAIL -', name, '\n        ', e.message);
    fail++;
  }
}

// parseSarif maps levels to severities.
test('parseSarif maps error/warning/note', () => {
  const f = parseSarif(sarif([result('IED-S001', 'error', 'a.ts', 3, 'fp1'), result('IED-Q001', 'warning', 'a.ts', 5), result('IED-Q003', 'note', 'a.ts', 7)]));
  assert.equal(f.length, 3);
  assert.deepEqual(f.map((x) => x.severity), ['error', 'warning', 'info']);
  assert.equal(f[0].fingerprint, 'fp1');
});

test('ingest + orgOverview aggregates latest scan per repo', () => {
  const store = openStore(':memory:');
  ingestPayload(store, { metadata: { repo: 'acme/api', team: 'platform', timestamp: '2026-06-01T00:00:00Z', loc: 2000 }, sarif: sarif([result('IED-S001', 'error', 'a.ts', 3, 'fp1'), result('IED-Q001', 'warning', 'b.ts', 5)]) }, '2026-06-01T00:00:00Z');
  ingestPayload(store, { metadata: { repo: 'acme/web', team: 'frontend', timestamp: '2026-06-01T00:00:00Z', loc: 1000 }, sarif: sarif([result('IED-Q001', 'warning', 'c.ts', 9)]) }, '2026-06-01T00:00:00Z');
  const o = store.orgOverview();
  assert.equal(o.repoCount, 2);
  assert.equal(o.errors, 1);
  assert.equal(o.warnings, 2);
  assert.equal(o.total, 3);
  assert.equal(o.topRepos[0].repo, 'acme/api'); // more findings
});

test('latest scan supersedes older ones for a repo', () => {
  const store = openStore(':memory:');
  ingestPayload(store, { metadata: { repo: 'r', timestamp: '2026-06-01T00:00:00Z' }, sarif: sarif([result('IED-S001', 'error', 'a.ts', 1), result('IED-S001', 'error', 'b.ts', 1)]) }, 'x');
  ingestPayload(store, { metadata: { repo: 'r', timestamp: '2026-06-02T00:00:00Z' }, sarif: sarif([result('IED-Q001', 'warning', 'a.ts', 1)]) }, 'x');
  const repos = store.listRepos();
  assert.equal(repos.length, 1);
  assert.equal(repos[0].errors, 0, 'latest scan has no errors');
  assert.equal(repos[0].warnings, 1);
});

test('repoFindings + fileFindings', () => {
  const store = openStore(':memory:');
  ingestPayload(store, { metadata: { repo: 'r', timestamp: 't' }, sarif: sarif([result('IED-S001', 'error', 'a.ts', 3), result('IED-Q001', 'warning', 'b.ts', 5)]) }, 't');
  assert.equal(store.repoFindings('r').length, 2);
  const fileF = store.fileFindings('r', 'a.ts');
  assert.equal(fileF.length, 1);
  assert.equal(fileF[0].ruleId, 'IED-S001');
});

test('ruleAnalytics + false-positive rate', () => {
  const store = openStore(':memory:');
  ingestPayload(store, { metadata: { repo: 'r', timestamp: 't' }, sarif: sarif([result('IED-Q001', 'warning', 'a.ts', 1, 'fpA'), result('IED-Q001', 'warning', 'b.ts', 2, 'fpB')]) }, 't');
  store.markFalsePositive('fpA', 'IED-Q001', 't');
  const stats = store.ruleAnalytics();
  const q1 = stats.find((s) => s.ruleId === 'IED-Q001');
  assert.equal(q1.count, 2);
  assert.equal(q1.falsePositives, 1);
  assert.equal(q1.fpRate, 0.5);
});

test('teamView groups repos by team', () => {
  const store = openStore(':memory:');
  ingestPayload(store, { metadata: { repo: 'a', team: 'platform', timestamp: 't' }, sarif: sarif([result('IED-S001', 'error', 'a.ts', 1)]) }, 't');
  ingestPayload(store, { metadata: { repo: 'b', team: 'platform', timestamp: 't' }, sarif: sarif([]) }, 't');
  const teams = store.teamView();
  const platform = teams.find((t) => t.team === 'platform');
  assert.equal(platform.repoCount, 2);
});

test('repoTrend returns chronological scores', () => {
  const store = openStore(':memory:');
  ingestPayload(store, { metadata: { repo: 'r', timestamp: '2026-06-01T00:00:00Z', loc: 1000 }, sarif: sarif([result('IED-S001', 'error', 'a.ts', 1)]) }, 'x');
  ingestPayload(store, { metadata: { repo: 'r', timestamp: '2026-06-02T00:00:00Z', loc: 1000 }, sarif: sarif([]) }, 'x');
  const trend = store.repoTrend('r');
  assert.equal(trend.length, 2);
  assert.ok(trend[1].score >= trend[0].score, 'score improved after fixing the error');
});

test('ingestHotspots + repoHotspots round-trips, sorted by risk', () => {
  const store = openStore(':memory:');
  ingestHotspotPayload(
    store,
    {
      metadata: { repo: 'acme/api', timestamp: '2026-07-01T00:00:00Z' },
      hotspots: [
        { file: 'a.ts', churn: 40, findingWeight: 30, risk: 90 },
        { file: 'b.ts', churn: 5, findingWeight: 2, risk: 20 },
        { file: 'c.ts', churn: 20, findingWeight: 10, risk: 55 }
      ]
    },
    'now'
  );
  const rows = store.repoHotspots('acme/api');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.file), ['a.ts', 'c.ts', 'b.ts'], 'sorted by risk desc');
  assert.equal(rows[0].churn, 40);
  assert.equal(rows[0].findingWeight, 30);
});

test('ingestHotspots is latest-wins per repo', () => {
  const store = openStore(':memory:');
  ingestHotspotPayload(store, { metadata: { repo: 'r', timestamp: 't1' }, hotspots: [{ file: 'old.ts', churn: 9, findingWeight: 9, risk: 99 }] }, 'now');
  ingestHotspotPayload(store, { metadata: { repo: 'r', timestamp: 't2' }, hotspots: [{ file: 'new.ts', churn: 1, findingWeight: 1, risk: 10 }] }, 'now');
  const rows = store.repoHotspots('r');
  assert.equal(rows.length, 1, 'old ranking cleared');
  assert.equal(rows[0].file, 'new.ts');
});

test('reposWithHotspots summarizes each repo by max risk', () => {
  const store = openStore(':memory:');
  ingestHotspotPayload(store, { metadata: { repo: 'low', timestamp: 't' }, hotspots: [{ file: 'a', churn: 1, findingWeight: 1, risk: 15 }] }, 'now');
  ingestHotspotPayload(store, { metadata: { repo: 'high', timestamp: 't' }, hotspots: [{ file: 'b', churn: 9, findingWeight: 9, risk: 88 }] }, 'now');
  const summary = store.reposWithHotspots();
  assert.equal(summary.length, 2);
  assert.equal(summary[0].repo, 'high', 'highest max-risk repo first');
  assert.equal(summary[0].maxRisk, 88);
});

test('ingestHotspotPayload rejects a payload without repo', () => {
  const store = openStore(':memory:');
  assert.throws(() => ingestHotspotPayload(store, { metadata: {}, hotspots: [] }, 'now'), /repo/);
});

console.log(`\n  ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
