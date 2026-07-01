/**
 * Plugin loader tests — the "rule marketplace".
 *
 * Exercises loadPlugins (resolution, shape handling, validation, dedup),
 * registerPlugins (registry integration + built-in collision), and proves a
 * loaded plugin rule actually fires end-to-end through the analyzer.
 */

import * as path from 'path';
import { test, runRule } from './harness';
import { loadPlugins, registerPlugins } from '../src/engine/plugin-loader';
import { RuleRegistry } from '../src/rules/registry';
import { defaultResolvedConfig } from '../src/config/resolve';
import { Severity, type Rule } from '../src/rules/types';

// Fixtures live in the SOURCE tree, not in dist-test. From the compiled test
// location (dist-test/test) the source fixtures are two levels up under test/.
const FIXTURES = path.resolve(__dirname, '..', '..', 'test', 'fixtures', 'plugins');

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

test('plugin-loader: loads a local plugin (module.exports = [...])', () => {
  const { rules, errors } = loadPlugins(['./sample-plugin.js'], FIXTURES);
  assert(errors.length === 0, `expected no errors, got: ${JSON.stringify(errors)}`);
  assert(rules.length === 1, `expected 1 rule, got ${rules.length}`);
  assert(rules[0].id === 'PLUGIN-001', `expected PLUGIN-001, got ${rules[0].id}`);
});

test('plugin-loader: accepts the { default: [...] } export shape', () => {
  const { rules, errors } = loadPlugins(['./default-export-plugin.js'], FIXTURES);
  assert(errors.length === 0, `expected no errors, got: ${JSON.stringify(errors)}`);
  assert(rules.length === 1 && rules[0].id === 'PLUGIN-002', 'expected PLUGIN-002 from default export');
});

test('plugin-loader: reports a missing plugin and does not throw', () => {
  const { rules, errors } = loadPlugins(['./does-not-exist.js'], FIXTURES);
  assert(rules.length === 0, 'expected no rules from a missing plugin');
  assert(errors.length === 1, `expected 1 error, got ${errors.length}`);
  assert(/could not load/.test(errors[0].message), `unexpected message: ${errors[0].message}`);
});

test('plugin-loader: rejects a non-array export', () => {
  const { rules, errors } = loadPlugins(['./bad-shape.js'], FIXTURES);
  assert(rules.length === 0, 'expected no rules from a bad-shape plugin');
  assert(errors.length === 1 && /must export an array/.test(errors[0].message), 'expected shape error');
});

test('plugin-loader: skips a malformed rule but keeps valid ones', () => {
  const { rules, errors } = loadPlugins(['./bad-rule.js'], FIXTURES);
  assert(rules.length === 1 && rules[0].id === 'PLUGIN-003', 'expected only the valid rule to load');
  assert(errors.length === 1 && /rule #0/.test(errors[0].message), `expected a rule #0 error, got ${JSON.stringify(errors)}`);
});

test('plugin-loader: a plugin rule fires end-to-end through the analyzer', async () => {
  const { rules } = loadPlugins(['./sample-plugin.js'], FIXTURES);
  const rule = rules[0] as Rule;
  const code = `
    function go() {
      dangerouslyDoThing();
      safeThing();
    }
  `;
  const diags = await runRule(rule, 'javascript', code);
  assert(diags.length === 1, `expected 1 finding, got ${diags.length}`);
  assert(diags[0].ruleId === 'PLUGIN-001', `expected PLUGIN-001, got ${diags[0].ruleId}`);
  assert(diags[0].severity === Severity.Error, `expected error severity, got ${diags[0].severity}`);
});

test('plugin-loader: registerPlugins adds rules to a registry', () => {
  const reg = new RuleRegistry();
  const config = defaultResolvedConfig(FIXTURES);
  config.plugins = ['./sample-plugin.js', './default-export-plugin.js'];
  const errors = registerPlugins(config, reg);
  assert(errors.length === 0, `expected clean registration, got: ${JSON.stringify(errors)}`);
  assert(reg.get('PLUGIN-001') !== undefined, 'PLUGIN-001 should be registered');
  assert(reg.get('PLUGIN-002') !== undefined, 'PLUGIN-002 should be registered');
});

test('plugin-loader: registerPlugins skips a rule whose id is already registered', () => {
  const reg = new RuleRegistry();
  // Pre-register a built-in-style rule that collides with the plugin's id.
  reg.register({
    id: 'PLUGIN-001',
    name: 'pre-existing',
    category: 'quality',
    severity: Severity.Warning,
    languages: ['javascript'],
    description: 'occupies the id first',
    docs: '',
    run() {}
  });
  const config = defaultResolvedConfig(FIXTURES);
  config.plugins = ['./sample-plugin.js'];
  const errors = registerPlugins(config, reg);
  assert(errors.length === 1 && /already registered/.test(errors[0].message), 'expected a collision warning');
  // The pre-existing rule must be untouched (built-ins win).
  assert(reg.get('PLUGIN-001')!.name === 'pre-existing', 'built-in copy should win');
});

test('plugin-loader: no plugins configured is a clean no-op', () => {
  const reg = new RuleRegistry();
  const config = defaultResolvedConfig(FIXTURES); // plugins defaults to []
  const errors = registerPlugins(config, reg);
  assert(errors.length === 0 && reg.size === 0, 'expected no work and no errors');
});
