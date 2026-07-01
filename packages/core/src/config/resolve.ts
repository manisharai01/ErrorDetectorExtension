/**
 * Config resolution. Loads `.iedrc.json` (or an `"ied"` key in package.json),
 * follows an `extends` chain, and flattens everything into a `ResolvedConfig`
 * the engine can consume without re-interpreting user shorthand.
 *
 * Rule settings accept:
 *   "IED-S001": "error"                         -> severity
 *   "IED-Q001": "off"                           -> disabled (severity = null)
 *   "IED-Q003": { "severity": "warn",
 *                 "options": { "threshold": 10 } }
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Severity } from '../rules/types';
import type { IEDConfig, ResolvedConfig, RuleSetting, ConfigSeverity } from './types';

export const DEFAULT_INCLUDE = ['**/*.{js,jsx,ts,tsx,vue}'];
export const DEFAULT_EXCLUDE = ['node_modules', 'dist', 'out', 'build', '.git'];

const CONFIG_SEVERITY: Record<Exclude<ConfigSeverity, 'off'>, Severity> = {
  error: Severity.Error,
  warn: Severity.Warning,
  warning: Severity.Warning,
  info: Severity.Info,
  hint: Severity.Hint
};

/** Translate a user-facing severity string to the enum, or `null` for "off". */
export function toSeverity(s: ConfigSeverity): Severity | null {
  if (s === 'off') return null;
  return CONFIG_SEVERITY[s] ?? null;
}

function defaultMaxWorkers(): number {
  return Math.max(1, os.cpus().length - 1);
}

/** A fully-resolved config with engine defaults and no rule overrides. */
export function defaultResolvedConfig(rootDir: string = process.cwd()): ResolvedConfig {
  return {
    ruleSeverities: new Map(),
    ruleOptions: new Map(),
    plugins: [],
    ai: {},
    include: [...DEFAULT_INCLUDE],
    exclude: [...DEFAULT_EXCLUDE],
    baseline: null,
    cache: true,
    cacheDir: path.join(rootDir, '.ied-cache'),
    maxWorkers: defaultMaxWorkers(),
    rootDir
  };
}

function applyRuleSetting(
  id: string,
  setting: RuleSetting,
  severities: Map<string, Severity | null>,
  options: Map<string, Record<string, unknown>>
): void {
  if (typeof setting === 'string') {
    severities.set(id, toSeverity(setting));
    return;
  }
  if (setting.severity !== undefined) {
    severities.set(id, toSeverity(setting.severity));
  }
  if (setting.options) {
    options.set(id, setting.options);
  }
}

/** Shallow-merge `override` onto `base`, with arrays/rules replaced sensibly. */
function mergeConfig(base: IEDConfig, override: IEDConfig): IEDConfig {
  const plugins =
    base.plugins || override.plugins
      ? [...new Set([...(base.plugins ?? []), ...(override.plugins ?? [])])]
      : undefined;
  return {
    ...base,
    ...override,
    rules: { ...(base.rules ?? {}), ...(override.rules ?? {}) },
    plugins,
    include: override.include ?? base.include,
    exclude: override.exclude ?? base.exclude
  };
}

/** Read and parse a single config file; returns `{}` if missing/invalid. */
function readConfigFile(filePath: string): IEDConfig {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as IEDConfig;
  } catch {
    return {};
  }
}

/**
 * Resolve a raw `IEDConfig` (already merged with its extends chain) into the
 * flat `ResolvedConfig`.
 */
export function resolveConfig(userConfig: IEDConfig, rootDir: string): ResolvedConfig {
  const ruleSeverities = new Map<string, Severity | null>();
  const ruleOptions = new Map<string, Record<string, unknown>>();

  for (const [id, setting] of Object.entries(userConfig.rules ?? {})) {
    applyRuleSetting(id, setting, ruleSeverities, ruleOptions);
  }

  return {
    ruleSeverities,
    ruleOptions,
    plugins: userConfig.plugins ?? [],
    ai: userConfig.ai ?? {},
    include: userConfig.include ?? [...DEFAULT_INCLUDE],
    exclude: userConfig.exclude ?? [...DEFAULT_EXCLUDE],
    baseline: userConfig.baseline ?? null,
    cache: userConfig.cache ?? true,
    cacheDir: userConfig.cacheDir
      ? path.resolve(rootDir, userConfig.cacheDir)
      : path.join(rootDir, '.ied-cache'),
    maxWorkers: userConfig.maxWorkers ?? defaultMaxWorkers(),
    rootDir
  };
}

/**
 * Load config from disk starting at `rootDir`:
 *   1. `.iedrc.json`
 *   2. the `"ied"` key in `package.json`
 *   3. built-in defaults
 * Resolves an `extends` chain (relative paths) depth-first before flattening.
 */
export function loadConfig(rootDir: string = process.cwd()): ResolvedConfig {
  const raw = loadRawConfig(rootDir);
  return raw ? resolveConfig(raw, rootDir) : defaultResolvedConfig(rootDir);
}

function loadRawConfig(rootDir: string, seen = new Set<string>()): IEDConfig | null {
  const rcPath = path.join(rootDir, '.iedrc.json');
  let raw: IEDConfig | null = null;

  if (fs.existsSync(rcPath)) {
    raw = readConfigFile(rcPath);
  } else {
    const jsPath = path.join(rootDir, 'ied.config.js');
    if (fs.existsSync(jsPath)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require(jsPath) as { default?: IEDConfig } & IEDConfig;
        raw = (mod && mod.default ? mod.default : mod) as IEDConfig;
      } catch {
        /* ignore a broken ied.config.js and fall through to package.json */
      }
    }
    if (!raw) {
      const pkgPath = path.join(rootDir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = readConfigFile(pkgPath) as IEDConfig & { ied?: IEDConfig };
        if (pkg.ied) raw = pkg.ied;
      }
    }
  }

  if (!raw) return null;

  // Resolve `extends` (string or array), merging parents first.
  const ext = raw.extends;
  if (ext) {
    const parents = Array.isArray(ext) ? ext : [ext];
    let merged: IEDConfig = {};
    for (const rel of parents) {
      const parentPath = path.resolve(rootDir, rel);
      if (seen.has(parentPath)) continue;
      seen.add(parentPath);
      const parent = loadRawConfig(path.dirname(parentPath), seen) ?? readConfigFile(parentPath);
      merged = mergeConfig(merged, parent);
    }
    raw = mergeConfig(merged, raw);
  }

  return raw;
}
