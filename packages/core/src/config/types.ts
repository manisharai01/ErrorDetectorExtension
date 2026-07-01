/**
 * Config schema types. Mirrors the `.iedrc.json` shape documented in the SDK.
 *
 * A rule's setting can be:
 *   - a string severity: "error" | "warn" | "warning" | "info" | "hint" | "off"
 *   - an object: { severity, options }
 */

import type { Severity } from '../rules/types';

/** Severity as written in user config. `"warn"` is accepted as an alias. */
export type ConfigSeverity = 'error' | 'warn' | 'warning' | 'info' | 'hint' | 'off';

export type RuleSetting =
  | ConfigSeverity
  | {
      severity?: ConfigSeverity;
      options?: Record<string, unknown>;
    };

/**
 * Optional configuration for the AI-augmented features (explain / generate-rule).
 *
 * AI is strictly opt-in and lives entirely outside the analysis engine: the core
 * scanner never reads these fields, never imports an AI SDK, and never touches
 * the network. They exist on the config type only so the CLI can read them from
 * the same `.iedrc.json` the rest of the tool uses.
 */
export interface AiConfig {
  /** Master switch. AI commands also require a resolvable API key regardless. */
  enabled?: boolean;
  /**
   * Anthropic API key. Prefer the `ANTHROPIC_API_KEY` environment variable over
   * committing a key to `.iedrc.json`.
   */
  apiKey?: string;
  /** Claude model id. Defaults to `claude-opus-4-8` when unset. */
  model?: string;
}

export interface IEDConfig {
  /** Optional path(s) to base configs to inherit from. */
  extends?: string | string[];
  /**
   * External rule packages to load (the "rule marketplace"). Each entry is
   * either an npm package name (`"@acme/ied-rules-graphql"`) resolved from the
   * project's node_modules, or a local path (`"./custom-rules/our-rules.js"`)
   * resolved relative to the project root. A package default-exports an array
   * of Rule objects; the engine registers them alongside the built-ins.
   */
  plugins?: string[];
  /** Per-rule settings keyed by rule id (e.g. "IED-S001"). */
  rules?: Record<string, RuleSetting>;
  /** Opt-in AI feature settings (explain / generate-rule). Engine ignores this. */
  ai?: AiConfig;
  /** Glob patterns of files to include. */
  include?: string[];
  /** Glob patterns to exclude. */
  exclude?: string[];
  /** Path to the baseline file. */
  baseline?: string;
  /** Enable the on-disk content-hash cache. */
  cache?: boolean;
  /** Cache directory (default `.ied-cache`). */
  cacheDir?: string;
  /** Max worker threads; defaults to cpus-1. */
  maxWorkers?: number;
}

/**
 * The fully-resolved config after merging defaults, extends chain, and user
 * overrides. Every field is concrete (no undefined) so the engine never has to
 * second-guess.
 */
export interface ResolvedConfig {
  /** Effective severity per rule id; `null` means the rule is disabled. */
  ruleSeverities: Map<string, Severity | null>;
  /** Effective options per rule id (empty object if none). */
  ruleOptions: Map<string, Record<string, unknown>>;
  /** External rule-package specs to load (npm names or local paths). */
  plugins: string[];
  /** Opt-in AI settings, passed through untouched for the CLI to read. */
  ai: AiConfig;
  include: string[];
  exclude: string[];
  baseline: string | null;
  cache: boolean;
  cacheDir: string;
  maxWorkers: number;
  /** Absolute path of the project root the config was resolved against. */
  rootDir: string;
}
