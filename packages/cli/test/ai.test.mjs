// Mocked tests for the opt-in AI features. No network: a fake AiClient returns
// canned responses, so this exercises prompt construction, response parsing,
// settings resolution, and the missing-key guard. Assumes dist/ exists.
import assert from 'node:assert';
import {
  resolveAiSettings,
  createAiClient,
  MissingApiKeyError,
  DEFAULT_AI_MODEL
} from '../dist/ai/client.js';
import { explainFinding, parseExplanation, buildExplainPrompt } from '../dist/ai/explain.js';
import { generateRule, parseGeneratedRule, buildGeneratePrompt } from '../dist/ai/generate-rule.js';

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok   - ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL - ${name}`);
    console.log('       ' + (err && err.stack ? err.stack.split('\n').join('\n       ') : String(err)));
  }
}

/** A mock client that records the last request and returns a canned reply. */
function mockClient(text, model = 'mock-model') {
  return {
    model,
    lastReq: null,
    async complete(req) {
      this.lastReq = req;
      return { text, stopReason: 'end_turn' };
    }
  };
}

const explainInput = {
  ruleId: 'IED-S001',
  ruleName: 'hardcoded-secret',
  message: 'Possible hardcoded secret.',
  severity: 'error',
  category: 'security',
  language: 'javascript',
  filePath: 'src/db.js',
  line: 12,
  codeContext: '> 12 | const apiKey = "sk-live-abc123";'
};

await test('resolveAiSettings: default model when nothing configured', () => {
  const prev = process.env.ANTHROPIC_API_KEY;
  const prevModel = process.env.IED_AI_MODEL;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.IED_AI_MODEL;
  try {
    const s = resolveAiSettings({ ai: {} }, {});
    assert.equal(s.apiKey, null);
    assert.equal(s.model, DEFAULT_AI_MODEL);
    assert.equal(DEFAULT_AI_MODEL, 'claude-opus-4-8');
  } finally {
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
    if (prevModel !== undefined) process.env.IED_AI_MODEL = prevModel;
  }
});

await test('resolveAiSettings: CLI flag beats config beats env', () => {
  const prev = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'env-key';
  try {
    const fromEnv = resolveAiSettings({ ai: {} }, {});
    assert.equal(fromEnv.apiKey, 'env-key');
    const fromConfig = resolveAiSettings({ ai: { apiKey: 'cfg-key', model: 'cfg-model' } }, {});
    assert.equal(fromConfig.apiKey, 'cfg-key');
    assert.equal(fromConfig.model, 'cfg-model');
    const fromFlag = resolveAiSettings(
      { ai: { apiKey: 'cfg-key' } },
      { apiKey: 'flag-key', model: 'flag-model' }
    );
    assert.equal(fromFlag.apiKey, 'flag-key');
    assert.equal(fromFlag.model, 'flag-model');
  } finally {
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
    else delete process.env.ANTHROPIC_API_KEY;
  }
});

await test('createAiClient: throws MissingApiKeyError without a key', async () => {
  await assert.rejects(
    () => createAiClient({ apiKey: null, model: 'm', enabledInConfig: false }),
    (err) => err instanceof MissingApiKeyError
  );
});

await test('buildExplainPrompt includes rule id, message, and code context', () => {
  const p = buildExplainPrompt(explainInput);
  assert.ok(p.includes('IED-S001'), 'has rule id');
  assert.ok(p.includes('Possible hardcoded secret.'), 'has message');
  assert.ok(p.includes('sk-live-abc123'), 'has code context');
  assert.ok(p.includes('src/db.js:12'), 'has file:line');
});

await test('parseExplanation: bare JSON object', () => {
  const ex = parseExplanation(
    '{"what":"A secret is hardcoded.","why":"It can leak.","howToFix":"Use env vars.","suggestedCode":"const k = process.env.KEY;"}'
  );
  assert.equal(ex.what, 'A secret is hardcoded.');
  assert.equal(ex.why, 'It can leak.');
  assert.equal(ex.howToFix, 'Use env vars.');
  assert.equal(ex.suggestedCode, 'const k = process.env.KEY;');
  assert.ok(!ex.degraded);
});

await test('parseExplanation: JSON wrapped in a ```json fence', () => {
  const ex = parseExplanation('Sure!\n```json\n{"what":"X","why":"Y","howToFix":"Z","suggestedCode":null}\n```\n');
  assert.equal(ex.what, 'X');
  assert.equal(ex.suggestedCode, null);
  assert.ok(!ex.degraded);
});

await test('parseExplanation: non-JSON reply degrades gracefully', () => {
  const ex = parseExplanation('I could not analyze that.');
  assert.ok(ex.degraded);
  assert.equal(ex.what, 'I could not analyze that.');
});

await test('explainFinding: drives the client and parses the reply', async () => {
  const client = mockClient('{"what":"hardcoded secret","why":"leak risk","howToFix":"env var","suggestedCode":null}');
  const ex = await explainFinding(client, explainInput);
  assert.equal(ex.what, 'hardcoded secret');
  assert.ok(client.lastReq.user.includes('IED-S001'), 'prompt reached the client');
  assert.equal(client.lastReq.maxTokens, 1024);
});

await test('buildGeneratePrompt includes description, language, and id', () => {
  const p = buildGeneratePrompt({ description: 'flag console.warn', language: 'typescript', ruleId: 'ACME-001' });
  assert.ok(p.includes('flag console.warn'));
  assert.ok(p.includes('typescript'));
  assert.ok(p.includes('ACME-001'));
});

await test('parseGeneratedRule: extracts code/query/notes from JSON', () => {
  const reply = JSON.stringify({
    code: 'module.exports = [{ id: "ACME-001" }];',
    query: '(call_expression) @c',
    notes: 'May false-positive on member calls.'
  });
  const g = parseGeneratedRule(reply);
  assert.ok(g.code.includes('module.exports'));
  assert.equal(g.query, '(call_expression) @c');
  assert.ok(g.notes.includes('false-positive'));
  assert.ok(!g.degraded);
});

await test('parseGeneratedRule: non-JSON reply degrades to raw code', () => {
  const g = parseGeneratedRule('module.exports = [];');
  assert.ok(g.degraded);
  assert.ok(g.code.includes('module.exports'));
});

await test('generateRule: drives the client and parses the reply', async () => {
  const client = mockClient('{"code":"module.exports = [];","query":"(identifier) @i","notes":"ok"}');
  const g = await generateRule(client, { description: 'flag foo', language: 'javascript' });
  assert.ok(g.code.includes('module.exports'));
  assert.ok(client.lastReq.user.includes('flag foo'));
  assert.equal(client.lastReq.maxTokens, 2048);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
