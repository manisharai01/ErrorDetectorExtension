// Integration-adapter tests with a recording fetch stub (no network).
// Run: npm run build:lib && node test/integrations.test.cjs
const { JiraIntegration } = require('../dist/lib/integrations/jira.js');
const { SlackIntegration } = require('../dist/lib/integrations/slack.js');
const { qualityScore } = require('../dist/lib/scoring.js');
const assert = require('assert');

function recorder(responses) {
  const calls = [];
  const queue = [...(responses || [])];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: init && init.body ? JSON.parse(init.body) : undefined });
    const r = queue.shift() || { ok: true, status: 200, json: {} };
    return {
      ok: r.ok,
      status: r.status,
      json: async () => r.json,
      text: async () => JSON.stringify(r.json || {})
    };
  };
  return { calls, fetchImpl };
}

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log('  ok   -', name);
    pass++;
  } catch (e) {
    console.error('  FAIL -', name, '\n        ', e.message);
    fail++;
  }
}

(async () => {
  // ── Jira ──────────────────────────────────────────────────────────────────
  await test('Jira creates an issue and returns key + url', async () => {
    const rec = recorder([{ ok: true, status: 201, json: { key: 'SEC-42' } }]);
    const jira = new JiraIntegration({
      baseUrl: 'https://acme.atlassian.net',
      email: 'bot@acme.com',
      apiToken: 't0ken',
      projectKey: 'SEC',
      fetchImpl: rec.fetchImpl
    });
    const issue = await jira.createIssueFromFinding(
      { ruleId: 'IED-S001', severity: 'error', message: 'AWS key', filePath: 'a.ts', line: 3 },
      { repo: 'acme/api', branch: 'main', commit: 'abc123' }
    );
    assert.equal(issue.key, 'SEC-42');
    assert.equal(issue.url, 'https://acme.atlassian.net/browse/SEC-42');
    assert.ok(rec.calls[0].url.endsWith('/rest/api/3/issue'));
    assert.equal(rec.calls[0].body.fields.project.key, 'SEC');
    assert.ok(rec.calls[0].init.headers.Authorization.startsWith('Basic '));
  });

  await test('Jira extracts a ticket ref from a TODO comment', async () => {
    const jira = new JiraIntegration({ baseUrl: 'x', email: 'e', apiToken: 't', projectKey: 'SEC' });
    assert.equal(jira.extractIssueRef('// TODO(PROJ-123): fix later'), 'PROJ-123');
    assert.equal(jira.extractIssueRef('// TODO: no ticket here'), null);
  });

  await test('Jira transitions an issue', async () => {
    const rec = recorder([{ ok: true, status: 204, json: {} }]);
    const jira = new JiraIntegration({ baseUrl: 'https://x', email: 'e', apiToken: 't', projectKey: 'SEC', fetchImpl: rec.fetchImpl });
    await jira.transitionIssue('SEC-42', 'Done');
    assert.ok(rec.calls[0].url.endsWith('/rest/api/3/issue/SEC-42/transitions'));
    assert.equal(rec.calls[0].body.transition.name, 'Done');
  });

  await test('Jira throws on a non-ok response', async () => {
    const rec = recorder([{ ok: false, status: 403, json: {} }]);
    const jira = new JiraIntegration({ baseUrl: 'https://x', email: 'e', apiToken: 't', projectKey: 'SEC', fetchImpl: rec.fetchImpl });
    await assert.rejects(() =>
      jira.createIssueFromFinding({ ruleId: 'R', severity: 'error', message: 'm', filePath: 'f', line: 1 }, { repo: 'r' })
    );
  });

  // ── Slack ─────────────────────────────────────────────────────────────────
  await test('Slack posts a quality-gate-failure message', async () => {
    const rec = recorder();
    const slack = new SlackIntegration({ webhookUrl: 'https://hooks.slack/x', fetchImpl: rec.fetchImpl });
    await slack.qualityGateFailed({ passed: false, failures: ['errors 3 exceeds maxErrors 0'] }, { repo: 'acme/api', branch: 'main' });
    assert.equal(rec.calls[0].url, 'https://hooks.slack/x');
    assert.ok(rec.calls[0].body.text.includes('Quality gate failed'));
    assert.ok(rec.calls[0].body.text.includes('acme/api'));
  });

  await test('Slack posts a weekly digest with trend + top rules', async () => {
    const rec = recorder();
    const slack = new SlackIntegration({ webhookUrl: 'https://h', fetchImpl: rec.fetchImpl });
    await slack.weeklyDigest({ repo: 'acme/api', score: 88, scoreTrend: 4, newFindings: 7, topRules: [{ ruleId: 'IED-Q001', count: 5 }], periodDays: 7 });
    const txt = rec.calls[0].body.text;
    assert.ok(txt.includes('88') && txt.includes('+4') && txt.includes('IED-Q001 (5)'));
  });

  await test('Slack @mentions the author on a security finding', async () => {
    const rec = recorder();
    const slack = new SlackIntegration({ webhookUrl: 'https://h', fetchImpl: rec.fetchImpl });
    await slack.securityFindingIntroduced(
      { ruleId: 'IED-S001', severity: 'error', message: 'AWS key', filePath: 'a.ts', line: 3 },
      { repo: 'acme/api', author: 'U123' }
    );
    assert.ok(rec.calls[0].body.text.includes('<@U123>'));
    assert.ok(rec.calls[0].body.text.includes('IED-S001'));
  });

  // ── Scoring ─────────────────────────────────────────────────────────────────
  await test('dashboard qualityScore matches the shared formula', async () => {
    assert.equal(qualityScore({ errors: 0, warnings: 0, infos: 0 }, 1000), 100);
    assert.equal(qualityScore({ errors: 10, warnings: 0, infos: 0 }, 1000), 50);
    assert.equal(qualityScore({ errors: 10, warnings: 0, infos: 0 }, 10000), 95);
  });

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
})();
