/**
 * Tests for the PHP rule pack. Each rule gets at least a true-positive, a
 * true-negative, and an edge case, per the SDK testing guidance. PHP sources
 * must start with `<?php` for the grammar to parse correctly.
 */

import * as assert from 'assert';
import { test, runRule, Severity } from './harness';
import {
  sqlInjectionRule,
  unserializeUserInputRule,
  typeJugglingRule,
  debugOutputRule
} from '../src/rules/php';

// ── IED-S017 sql-injection ───────────────────────────────────────────────────

test('IED-S017 flags concatenated SQL assigned to $sql', async () => {
  const code = `<?php
$sql = "SELECT * FROM users WHERE id = " . $id;`;
  const found = await runRule(sqlInjectionRule, 'php', code);
  assert.equal(found.length, 1);
  assert.equal(found[0].ruleId, 'IED-S017');
  assert.equal(found[0].severity, Severity.Error);
});

test('IED-S017 flags concatenated SQL passed to a db call', async () => {
  const code = `<?php
$db->query("DELETE FROM sessions WHERE token = " . $token);`;
  const found = await runRule(sqlInjectionRule, 'php', code);
  assert.equal(found.length, 1);
});

test('IED-S017 flags interpolated SQL string', async () => {
  const code = `<?php
$query = "SELECT * FROM accounts WHERE name = $name";`;
  const found = await runRule(sqlInjectionRule, 'php', code);
  assert.equal(found.length, 1);
});

test('IED-S017 ignores parameterized prepared statements', async () => {
  const code = `<?php
$stmt = $db->prepare("SELECT * FROM users WHERE id = ?");`;
  const found = await runRule(sqlInjectionRule, 'php', code);
  assert.equal(found.length, 0);
});

test('IED-S017 ignores concat of a non-SQL string with a variable', async () => {
  const code = `<?php
$label = "Welcome " . $name;`;
  const found = await runRule(sqlInjectionRule, 'php', code);
  assert.equal(found.length, 0);
});

test('IED-S017 ignores a static SQL literal with no variable', async () => {
  const code = `<?php
$sql = "SELECT * FROM users WHERE active = 1";`;
  const found = await runRule(sqlInjectionRule, 'php', code);
  assert.equal(found.length, 0);
});

// ── IED-S018 unserialize-user-input ──────────────────────────────────────────

test('IED-S018 flags unserialize on a superglobal', async () => {
  const code = `<?php
$obj = unserialize($_GET['data']);`;
  const found = await runRule(unserializeUserInputRule, 'php', code);
  assert.equal(found.length, 1);
  assert.equal(found[0].ruleId, 'IED-S018');
  assert.equal(found[0].severity, Severity.Error);
  assert.equal(found[0].data?.superglobal, '_GET');
});

test('IED-S018 flags unserialize on a plain variable', async () => {
  const code = `<?php
$thing = unserialize($payload);`;
  const found = await runRule(unserializeUserInputRule, 'php', code);
  assert.equal(found.length, 1);
});

test('IED-S018 ignores unserialize on a string literal', async () => {
  const code = `<?php
$config = unserialize("a:0:{}");`;
  const found = await runRule(unserializeUserInputRule, 'php', code);
  assert.equal(found.length, 0);
});

test('IED-S018 ignores json_decode of a superglobal', async () => {
  const code = `<?php
$obj = json_decode($_GET['data'], true);`;
  const found = await runRule(unserializeUserInputRule, 'php', code);
  assert.equal(found.length, 0);
});

// ── IED-L018 type-juggling ───────────────────────────────────────────────────

test('IED-L018 flags loose == comparison', async () => {
  const code = `<?php
if ($a == $b) { echo "x"; }`;
  const found = await runRule(typeJugglingRule, 'php', code);
  assert.equal(found.length, 1);
  assert.equal(found[0].ruleId, 'IED-L018');
  assert.equal(found[0].severity, Severity.Warning);
  assert.equal(found[0].data?.operator, '==');
});

test('IED-L018 flags loose != comparison', async () => {
  const code = `<?php
if ($token != $expected) { echo "x"; }`;
  const found = await runRule(typeJugglingRule, 'php', code);
  assert.equal(found.length, 1);
  assert.equal(found[0].data?.operator, '!=');
});

test('IED-L018 ignores strict === comparison', async () => {
  const code = `<?php
if ($a === $b) { echo "x"; }`;
  const found = await runRule(typeJugglingRule, 'php', code);
  assert.equal(found.length, 0);
});

test('IED-L018 ignores strict !== comparison', async () => {
  const code = `<?php
if ($token !== $expected) { echo "x"; }`;
  const found = await runRule(typeJugglingRule, 'php', code);
  assert.equal(found.length, 0);
});

// ── IED-Q014 debug-output ────────────────────────────────────────────────────

test('IED-Q014 flags var_dump', async () => {
  const code = `<?php
var_dump($user);`;
  const found = await runRule(debugOutputRule, 'php', code);
  assert.equal(found.length, 1);
  assert.equal(found[0].ruleId, 'IED-Q014');
  assert.equal(found[0].severity, Severity.Warning);
});

test('IED-Q014 flags print_r and var_export too', async () => {
  const code = `<?php
print_r($x);
var_export($y);`;
  const found = await runRule(debugOutputRule, 'php', code);
  assert.equal(found.length, 2);
});

test('IED-Q014 is relaxed inside test files', async () => {
  const code = `<?php
var_dump($user);`;
  const found = await runRule(debugOutputRule, 'php', code, { isTestFile: true });
  assert.equal(found.length, 0);
});

test('IED-Q014 ignores ordinary function calls', async () => {
  const code = `<?php
$logger->debug("handling", ["id" => $id]);`;
  const found = await runRule(debugOutputRule, 'php', code);
  assert.equal(found.length, 0);
});
