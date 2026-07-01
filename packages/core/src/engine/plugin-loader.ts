/**
 * Plugin loader — the "rule marketplace".
 *
 * External rule packages are listed in `.iedrc.json` under `"plugins"`:
 *
 *   { "plugins": ["@acme/ied-rules-graphql", "./custom-rules/our-rules.js"] }
 *
 * Each entry resolves to a CommonJS module that exports an array of `Rule`
 * objects (the same contract as a built-in rule — see rules/types.ts). The
 * default export may be the array directly, or `{ default: [...] }`, or
 * `{ rules: [...] }`.
 *
 * Loading is deliberately tolerant: a single bad plugin (missing module,
 * throwing on require, wrong shape, malformed rule) is reported and skipped
 * rather than crashing the whole run. The caller decides how loudly to surface
 * the collected errors.
 */

import { createRequire } from 'module';
import * as path from 'path';
import {
  Severity,
  ruleAppliesTo,
  ALL_LANGUAGES,
  type Rule,
  type Language,
  type RuleCategory
} from '../rules/types';
import { registry, type RuleRegistry } from '../rules/registry';
import type { ResolvedConfig } from '../config/types';

const VALID_SEVERITIES = new Set<string>(Object.values(Severity));
const VALID_CATEGORIES = new Set<RuleCategory>([
  'logic',
  'security',
  'quality',
  'framework',
  'performance',
  'concurrency',
  'type-safety',
  'resource'
]);
const VALID_LANGUAGES = new Set<Language>(ALL_LANGUAGES);

/** A non-fatal problem encountered loading one plugin spec. */
export interface PluginError {
  /** The spec from config (`"@acme/ied-rules"` or `"./rules.js"`). */
  spec: string;
  /** Human-readable reason the spec (or one of its rules) was rejected. */
  message: string;
}

export interface LoadPluginsResult {
  /** All valid rules harvested from the loaded plugins, in declaration order. */
  rules: Rule[];
  /** Per-spec / per-rule problems; empty when everything loaded cleanly. */
  errors: PluginError[];
}

/**
 * Resolve and load every plugin spec relative to `rootDir`.
 *
 * - A spec that looks like a path (`.`-relative, absolute, or with a separator)
 *   is resolved against `rootDir`.
 * - Anything else is treated as an npm package name and resolved from
 *   `rootDir`'s module paths (so a project's own node_modules wins).
 */
export function loadPlugins(specs: string[], rootDir: string): LoadPluginsResult {
  const rules: Rule[] = [];
  const errors: PluginError[] = [];
  const seenIds = new Set<string>();

  // Resolve module ids relative to the project, not @ied/core's own location.
  const requireFrom = createRequire(path.join(rootDir, 'noop.js'));

  for (const spec of specs) {
    let mod: unknown;
    try {
      const resolved = isPathLike(spec)
        ? path.resolve(rootDir, spec)
        : requireFrom.resolve(spec);
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      mod = requireFrom(resolved);
    } catch (err) {
      errors.push({ spec, message: `could not load plugin: ${errText(err)}` });
      continue;
    }

    const exported = extractRulesArray(mod);
    if (!exported) {
      errors.push({
        spec,
        message:
          'plugin must export an array of rules (module.exports = [...], ' +
          'or { default: [...] }, or { rules: [...] })'
      });
      continue;
    }

    exported.forEach((candidate, i) => {
      const problem = validateRule(candidate);
      if (problem) {
        errors.push({ spec, message: `rule #${i}: ${problem}` });
        return;
      }
      const rule = candidate as Rule;
      if (seenIds.has(rule.id)) {
        errors.push({ spec, message: `duplicate rule id "${rule.id}" (already loaded)` });
        return;
      }
      seenIds.add(rule.id);
      rules.push(rule);
    });
  }

  return { rules, errors };
}

/**
 * A spec is a local path when it starts with `.` (`./rules.js`, `../x`) or is
 * absolute. Everything else — bare (`lodash`) or scoped (`@acme/ied-rules`)
 * package names — is resolved from the project's node_modules.
 */
function isPathLike(spec: string): boolean {
  return spec.startsWith('.') || path.isAbsolute(spec);
}

/** Pull the rules array out of whatever shape the module exported. */
function extractRulesArray(mod: unknown): unknown[] | null {
  if (Array.isArray(mod)) return mod;
  if (mod && typeof mod === 'object') {
    const m = mod as { default?: unknown; rules?: unknown };
    if (Array.isArray(m.default)) return m.default;
    if (Array.isArray(m.rules)) return m.rules;
  }
  return null;
}

/** Returns a problem string if `candidate` is not a valid Rule, else null. */
function validateRule(candidate: unknown): string | null {
  if (!candidate || typeof candidate !== 'object') return 'not an object';
  const r = candidate as Partial<Rule> & Record<string, unknown>;

  if (typeof r.id !== 'string' || r.id.length === 0) return 'missing string "id"';
  if (typeof r.name !== 'string' || r.name.length === 0) return 'missing string "name"';
  if (typeof r.description !== 'string') return 'missing string "description"';
  if (typeof r.run !== 'function') return 'missing run(context) function';

  if (typeof r.category !== 'string' || !VALID_CATEGORIES.has(r.category as RuleCategory)) {
    return `invalid category "${String(r.category)}"`;
  }
  if (typeof r.severity !== 'string' || !VALID_SEVERITIES.has(r.severity)) {
    return `invalid severity "${String(r.severity)}"`;
  }
  if (!Array.isArray(r.languages) || r.languages.length === 0) {
    return 'languages must be a non-empty array';
  }
  for (const lang of r.languages) {
    if (!VALID_LANGUAGES.has(lang as Language)) {
      return `unknown language "${String(lang)}"`;
    }
  }
  if (r.fix !== undefined && typeof r.fix !== 'function') {
    return 'fix must be a function when present';
  }
  return null;
}

function errText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Load the plugins named in `config.plugins` (resolved against `config.rootDir`)
 * and register them into the registry alongside the built-ins. A plugin rule
 * whose id collides with an already-registered rule is skipped and reported —
 * built-ins always win. Idempotent per registry: re-registering an id already
 * present is a no-op (so the main process and each worker can both call this).
 *
 * Returns the collected errors; an empty array means everything loaded cleanly.
 * This NEVER throws — a broken plugin must not take down the engine.
 */
export function registerPlugins(
  config: ResolvedConfig,
  target: RuleRegistry = registry
): PluginError[] {
  if (!config.plugins || config.plugins.length === 0) return [];

  const { rules, errors } = loadPlugins(config.plugins, config.rootDir);
  for (const rule of rules) {
    if (target.get(rule.id)) {
      errors.push({
        spec: '(registry)',
        message: `rule id "${rule.id}" is already registered — skipping plugin copy`
      });
      continue;
    }
    target.register(rule);
  }
  return errors;
}

/** Re-export for callers that want to filter loaded plugin rules by language. */
export { ruleAppliesTo };
