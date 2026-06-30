/**
 * Policy engine: lock enforcement (tighten-ok / loosen-rejected), glob locks,
 * threshold merging, the quality gate, and the suppression-without-reason rule.
 */
import * as assert from 'assert';
import { test, runRule } from './harness';
import {
  resolvePolicy,
  repoConfigAsLayer,
  evaluateThresholds,
  type PolicyLayer
} from '../src/config/policy';
import { Severity } from '../src/rules/types';
import { scoreFindings } from '../src/engine/scoring';
import { suppressionWithoutReasonRule } from '../src/rules/code-smells/suppression-without-reason';

function layers(...ls: PolicyLayer[]): PolicyLayer[] {
  return ls;
}

// ── Lock enforcement ─────────────────────────────────────────────────────────

test('policy: repo cannot loosen a locked security rule', () => {
  const r = resolvePolicy(
    layers(
      { name: 'org', policy: { version: 1, rules: { 'IED-S001': { severity: 'error', locked: true } } } },
      repoConfigAsLayer({ rules: { 'IED-S001': 'off' } })
    )
  );
  assert.equal(r.severities.get('IED-S001'), Severity.Error, 'locked rule stays at error');
  assert.equal(r.violations.length, 1, 'one violation recorded');
  assert.equal(r.violations[0].ruleId, 'IED-S001');
});

test('policy: repo CAN tighten a locked rule (warn -> error)', () => {
  const r = resolvePolicy(
    layers(
      { name: 'org', policy: { version: 1, rules: { 'IED-Q001': { severity: 'warn', locked: true } } } },
      repoConfigAsLayer({ rules: { 'IED-Q001': 'error' } })
    )
  );
  assert.equal(r.severities.get('IED-Q001'), Severity.Error, 'tightening allowed');
  assert.equal(r.violations.length, 0);
});

test('policy: a `locked` glob locks every matching rule', () => {
  const r = resolvePolicy(
    layers(
      {
        name: 'org',
        policy: {
          version: 1,
          rules: { 'IED-S001': 'error', 'IED-S005': 'error' },
          locked: ['IED-S*']
        }
      },
      repoConfigAsLayer({ rules: { 'IED-S005': 'off' } })
    )
  );
  assert.ok(r.locked.has('IED-S001') && r.locked.has('IED-S005'), 'both S-rules locked');
  assert.equal(r.severities.get('IED-S005'), Severity.Error, 'glob-locked rule cannot be disabled');
  assert.equal(r.violations.length, 1);
});

test('policy: unlocked rule can be changed freely by the repo', () => {
  const r = resolvePolicy(
    layers(
      { name: 'org', policy: { version: 1, rules: { 'IED-Q001': 'warn' } } },
      repoConfigAsLayer({ rules: { 'IED-Q001': 'off' } })
    )
  );
  assert.equal(r.severities.get('IED-Q001'), null, 'repo disabled an unlocked rule');
  assert.equal(r.violations.length, 0);
});

test('policy: team layer between org and repo also cannot loosen', () => {
  const r = resolvePolicy(
    layers(
      { name: 'org', policy: { version: 1, rules: { 'IED-S002': { severity: 'error', locked: true } } } },
      { name: 'team', policy: { version: 1, rules: { 'IED-S002': 'warn' } } },
      repoConfigAsLayer({ rules: {} })
    )
  );
  assert.equal(r.severities.get('IED-S002'), Severity.Error);
  assert.equal(r.violations[0].layer, 'team');
});

// ── Thresholds + quality gate ────────────────────────────────────────────────

test('policy: thresholds merge to the stricter bound', () => {
  const r = resolvePolicy(
    layers(
      { name: 'org', policy: { version: 1, thresholds: { maxErrors: 5, minScore: 70 } } },
      { name: 'team', policy: { version: 1, thresholds: { maxErrors: 0, minScore: 60 } } }
    )
  );
  assert.equal(r.thresholds.maxErrors, 0, 'stricter maxErrors wins');
  assert.equal(r.thresholds.minScore, 70, 'stricter (higher) minScore wins');
});

test('gate: fails when errors exceed max or score below min', () => {
  const gate = evaluateThresholds({ errors: 2, warnings: 0, score: 90 }, { maxErrors: 0, minScore: 80 });
  assert.equal(gate.passed, false);
  assert.equal(gate.failures.length, 1);
});

test('gate: passes when within bounds', () => {
  const gate = evaluateThresholds({ errors: 0, warnings: 3, score: 95 }, { maxErrors: 0, maxWarnings: 50, minScore: 80 });
  assert.equal(gate.passed, true);
});

// ── Scoring ──────────────────────────────────────────────────────────────────

test('score: clean code scores 100', () => {
  assert.equal(scoreFindings({ errors: 0, warnings: 0, infos: 0 }, 1000), 100);
});

test('score: penalises errors most and is clamped/normalized per KLOC', () => {
  // 10 errors over 1 KLOC -> 100 - 50 = 50.
  assert.equal(scoreFindings({ errors: 10, warnings: 0, infos: 0 }, 1000), 50);
  // Same 10 errors over 10 KLOC -> 100 - 5 = 95 (normalized).
  assert.equal(scoreFindings({ errors: 10, warnings: 0, infos: 0 }, 10000), 95);
  // Never below 0.
  assert.equal(scoreFindings({ errors: 100, warnings: 0, infos: 0 }, 1000), 0);
});

// ── IED-Q013 suppression-without-reason ──────────────────────────────────────

test('IED-Q013 flags a suppression with no reason', async () => {
  const f = await runRule(
    suppressionWithoutReasonRule,
    'javascript',
    '// ied-disable-next-line IED-S001\nconst k = secret();'
  );
  assert.ok(f.some((d) => d.ruleId === 'IED-Q013'));
});

test('IED-Q013 accepts a suppression with a reason', async () => {
  const f = await runRule(
    suppressionWithoutReasonRule,
    'javascript',
    '// ied-disable-next-line IED-S001 — injected from the vault at boot\nconst k = secret();'
  );
  assert.equal(f.length, 0);
});

test('IED-Q013 works with Python # comments', async () => {
  const f = await runRule(suppressionWithoutReasonRule, 'python', '# ied-disable-next-line IED-S001\nk = secret()');
  assert.ok(f.some((d) => d.ruleId === 'IED-Q013'));
});
