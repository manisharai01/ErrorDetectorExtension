/**
 * Hierarchical policy engine.
 *
 *   Org policy   (.ied-policy.json, hosted centrally)
 *     └─ Team policy   (inherits org; may TIGHTEN but not LOOSEN locked rules)
 *          └─ Repo config (.iedrc.json)
 *               └─ File overrides (inline // ied-disable …)
 *
 * Layers are resolved most-authoritative-first (org → team → repo). A rule that
 * an upstream layer marks `locked` (or that matches a `locked` glob such as
 * `"IED-S*"`) cannot be disabled or have its severity lowered downstream —
 * attempts are recorded as `PolicyViolation`s and the locked severity is kept.
 * Severity may always be RAISED (tightened) downstream.
 *
 * `thresholds` form a quality gate; downstream layers may only tighten them.
 */

import { Severity } from '../rules/types';
import type { ConfigSeverity, IEDConfig, ResolvedConfig, RuleSetting } from './types';

export interface PolicyRuleSetting {
  severity: ConfigSeverity;
  locked?: boolean;
}

export interface PolicyThresholds {
  maxErrors?: number;
  maxWarnings?: number;
  minScore?: number;
}

export interface Policy {
  version: number;
  name?: string;
  /** Per-rule severity (+ optional lock). A bare string is shorthand for `{severity}`. */
  rules?: Record<string, PolicyRuleSetting | ConfigSeverity>;
  thresholds?: PolicyThresholds;
  /** Glob patterns (e.g. `"IED-S*"`) whose rules are locked at their set severity. */
  locked?: string[];
}

export interface PolicyViolation {
  ruleId: string;
  attempted: ConfigSeverity;
  enforced: Severity | null;
  layer: string;
  reason: string;
}

export interface ResolvedPolicy {
  /** Effective severity per rule id; `null` = disabled. */
  severities: Map<string, Severity | null>;
  /** Rule ids that are locked (cannot be loosened downstream). */
  locked: Set<string>;
  thresholds: PolicyThresholds;
  /** Downstream attempts to loosen a locked rule, or loosen a threshold. */
  violations: PolicyViolation[];
}

export interface PolicyLayer {
  name: string;
  policy: Policy;
}

/** Severity rank for tighten/loosen comparisons (`off`/null is the loosest). */
const RANK: Record<Severity, number> = {
  [Severity.Hint]: 1,
  [Severity.Info]: 2,
  [Severity.Warning]: 3,
  [Severity.Error]: 4
};
function rankOf(s: Severity | null): number {
  return s === null ? 0 : RANK[s];
}

const SEV: Record<Exclude<ConfigSeverity, 'off'>, Severity> = {
  error: Severity.Error,
  warn: Severity.Warning,
  warning: Severity.Warning,
  info: Severity.Info,
  hint: Severity.Hint
};
function toSev(s: ConfigSeverity): Severity | null {
  return s === 'off' ? null : SEV[s] ?? null;
}
function sevLabel(s: Severity | null): string {
  return s === null ? 'off' : s;
}

/** Convert a rule-id glob (`IED-S*`) to an anchored RegExp. */
function globToRe(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

function normalizeRule(raw: PolicyRuleSetting | ConfigSeverity): PolicyRuleSetting {
  return typeof raw === 'string' ? { severity: raw } : raw;
}

/** Tighten-only threshold merge: keep the stricter of each bound. */
function tightenThresholds(
  into: PolicyThresholds,
  next: PolicyThresholds | undefined,
  layer: string,
  violations: PolicyViolation[]
): void {
  if (!next) return;
  const tighten = (
    key: keyof PolicyThresholds,
    pick: (a: number, b: number) => number,
    direction: 'lower' | 'higher'
  ): void => {
    const incoming = next[key];
    if (incoming === undefined) return;
    const current = into[key];
    if (current === undefined) {
      into[key] = incoming;
      return;
    }
    const chosen = pick(current, incoming);
    into[key] = chosen;
    // A downstream value that loosens (didn't get chosen and differs) is a violation.
    if (incoming !== chosen) {
      violations.push({
        ruleId: `threshold:${key}`,
        attempted: 'off',
        enforced: null,
        layer,
        reason: `Threshold ${key} can only be ${direction === 'lower' ? 'lowered' : 'raised'}; kept ${chosen}, ignored ${incoming}.`
      });
    }
  };
  // maxErrors / maxWarnings: stricter = lower. minScore: stricter = higher.
  tighten('maxErrors', Math.min, 'lower');
  tighten('maxWarnings', Math.min, 'lower');
  tighten('minScore', Math.max, 'higher');
}

/**
 * Resolve an ordered list of policy layers (most authoritative first) into the
 * effective severities, lock set, merged thresholds, and any violations.
 */
export function resolvePolicy(layers: PolicyLayer[]): ResolvedPolicy {
  const severities = new Map<string, Severity | null>();
  const locked = new Set<string>();
  const lockedFloor = new Map<string, Severity | null>();
  const lockGlobs: RegExp[] = [];
  const thresholds: PolicyThresholds = {};
  const violations: PolicyViolation[] = [];

  const isGlobLocked = (id: string): boolean => lockGlobs.some((re) => re.test(id));

  for (const { name, policy } of layers) {
    tightenThresholds(thresholds, policy.thresholds, name, violations);
    for (const g of policy.locked ?? []) lockGlobs.push(globToRe(g));

    for (const [id, raw] of Object.entries(policy.rules ?? {})) {
      const setting = normalizeRule(raw);
      const proposed = toSev(setting.severity);
      const lockHere = setting.locked === true || isGlobLocked(id);

      if (locked.has(id)) {
        const floor = lockedFloor.get(id) ?? null;
        if (rankOf(proposed) < rankOf(floor)) {
          violations.push({
            ruleId: id,
            attempted: setting.severity,
            enforced: floor,
            layer: name,
            reason: `Rule ${id} is locked at "${sevLabel(floor)}"; cannot lower to "${setting.severity}".`
          });
          severities.set(id, floor); // keep the enforced floor
        } else {
          severities.set(id, proposed); // tightening is allowed
          lockedFloor.set(id, proposed); // floor rises with the tightening
        }
      } else {
        severities.set(id, proposed);
        if (lockHere) {
          locked.add(id);
          lockedFloor.set(id, proposed);
        }
      }
    }
  }

  // A `locked` glob introduced by any layer also locks already-set rules.
  for (const id of severities.keys()) {
    if (!locked.has(id) && isGlobLocked(id)) {
      locked.add(id);
      lockedFloor.set(id, severities.get(id) ?? null);
    }
  }

  return { severities, locked, thresholds, violations };
}

/** Wrap a repo `.iedrc.json` as the most-downstream policy layer. */
export function repoConfigAsLayer(config: IEDConfig, name = 'repo'): PolicyLayer {
  const rules: Record<string, ConfigSeverity> = {};
  for (const [id, setting] of Object.entries(config.rules ?? {})) {
    rules[id] = ruleSettingSeverity(setting);
  }
  return { name, policy: { version: 1, rules } };
}

function ruleSettingSeverity(setting: RuleSetting): ConfigSeverity {
  if (typeof setting === 'string') return setting;
  return setting.severity ?? 'warning';
}

/**
 * Apply a resolved policy onto a `ResolvedConfig`: the policy's enforced
 * severities win over whatever the repo config produced.
 */
export function applyPolicy(base: ResolvedConfig, resolved: ResolvedPolicy): ResolvedConfig {
  const ruleSeverities = new Map(base.ruleSeverities);
  for (const [id, sev] of resolved.severities) ruleSeverities.set(id, sev);
  return { ...base, ruleSeverities };
}

export interface GateInput {
  errors: number;
  warnings: number;
  infos?: number;
  /** 0–100 quality score (see scoring). */
  score: number;
}

export interface GateResult {
  passed: boolean;
  failures: string[];
}

/** Evaluate scan counts against the merged thresholds (the quality gate). */
export function evaluateThresholds(input: GateInput, thresholds: PolicyThresholds): GateResult {
  const failures: string[] = [];
  if (thresholds.maxErrors !== undefined && input.errors > thresholds.maxErrors) {
    failures.push(`errors ${input.errors} exceeds maxErrors ${thresholds.maxErrors}`);
  }
  if (thresholds.maxWarnings !== undefined && input.warnings > thresholds.maxWarnings) {
    failures.push(`warnings ${input.warnings} exceeds maxWarnings ${thresholds.maxWarnings}`);
  }
  if (thresholds.minScore !== undefined && input.score < thresholds.minScore) {
    failures.push(`score ${input.score} is below minScore ${thresholds.minScore}`);
  }
  return { passed: failures.length === 0, failures };
}
