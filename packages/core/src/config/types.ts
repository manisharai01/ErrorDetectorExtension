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

export interface IEDConfig {
  /** Optional path(s) to base configs to inherit from. */
  extends?: string | string[];
  /** Per-rule settings keyed by rule id (e.g. "IED-S001"). */
  rules?: Record<string, RuleSetting>;
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
  include: string[];
  exclude: string[];
  baseline: string | null;
  cache: boolean;
  cacheDir: string;
  maxWorkers: number;
  /** Absolute path of the project root the config was resolved against. */
  rootDir: string;
}
